const pool = require('../config/db');

// Central de avisos (sininho), aparelhos inscritos no Web Push e
// controle de lembretes já enviados. Cada login só vê os próprios avisos.
const notificacoesModel = {

    // ---------------------------------------------------------
    // Avisos
    // ---------------------------------------------------------
    criar: async (idsUsuarios, { tipo, titulo, mensagem, rota = null }) => {
        if (!idsUsuarios.length) return [];
        const result = await pool.query(
            `INSERT INTO notificacoes (id_usuario, tipo, titulo, mensagem, rota)
             SELECT id, $2, $3, $4, $5 FROM unnest($1::int[]) AS id
             RETURNING id_notificacao, id_usuario`,
            [idsUsuarios, tipo, titulo.slice(0, 150), mensagem.slice(0, 500), rota]
        );
        return result.rows;
    },

    listar: async (idUsuario, limite = 30) => {
        const [lista, total] = await Promise.all([
            pool.query(
                `SELECT id_notificacao, tipo, titulo, mensagem, rota, lida, criado_em
                 FROM notificacoes WHERE id_usuario = $1
                 ORDER BY criado_em DESC, id_notificacao DESC LIMIT $2`,
                [idUsuario, limite]
            ),
            pool.query('SELECT COUNT(*)::int AS n FROM notificacoes WHERE id_usuario = $1 AND NOT lida', [idUsuario])
        ]);
        return { nao_lidas: total.rows[0].n, notificacoes: lista.rows };
    },

    // Só marca avisos do próprio login (devolve false se não for dele)
    marcarLida: async (idUsuario, idNotificacao) => {
        const result = await pool.query(
            'UPDATE notificacoes SET lida = TRUE WHERE id_notificacao = $2 AND id_usuario = $1',
            [idUsuario, idNotificacao]
        );
        return result.rowCount > 0;
    },

    marcarTodasLidas: async (idUsuario) => {
        await pool.query('UPDATE notificacoes SET lida = TRUE WHERE id_usuario = $1 AND NOT lida', [idUsuario]);
    },

    // Apaga só os avisos já lidos: os não lidos nunca somem sem serem vistos
    limparLidas: async (idUsuario) => {
        const result = await pool.query('DELETE FROM notificacoes WHERE id_usuario = $1 AND lida', [idUsuario]);
        return result.rowCount;
    },

    // ---------------------------------------------------------
    // Aparelhos (Web Push)
    // ---------------------------------------------------------
    // Um aparelho (endpoint) pertence a um login por vez: se outra pessoa
    // entrar no mesmo navegador e ativar, a inscrição passa a ser dela.
    inscrever: async (idUsuario, { endpoint, p256dh, auth, aparelho }) => {
        const result = await pool.query(
            `INSERT INTO push_inscricoes (id_usuario, endpoint, p256dh, auth, aparelho)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (endpoint) DO UPDATE
                SET id_usuario = EXCLUDED.id_usuario, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                    aparelho = EXCLUDED.aparelho, criado_em = CURRENT_TIMESTAMP
             RETURNING id_inscricao`,
            [idUsuario, endpoint, p256dh, auth, aparelho]
        );
        return result.rows[0];
    },

    cancelar: async (idUsuario, endpoint) => {
        const result = await pool.query('DELETE FROM push_inscricoes WHERE id_usuario = $1 AND endpoint = $2', [idUsuario, endpoint]);
        return result.rowCount > 0;
    },

    inscricoesDe: async (idsUsuarios) => {
        if (!idsUsuarios.length) return [];
        const result = await pool.query(
            'SELECT id_inscricao, id_usuario, endpoint, p256dh, auth FROM push_inscricoes WHERE id_usuario = ANY($1::int[])',
            [idsUsuarios]
        );
        return result.rows;
    },

    totalAparelhos: async (idUsuario) => {
        const result = await pool.query('SELECT COUNT(*)::int AS n FROM push_inscricoes WHERE id_usuario = $1', [idUsuario]);
        return result.rows[0].n;
    },

    // Aparelho que não existe mais (desinstalou, limpou os dados): sai da lista
    removerInscricao: (idInscricao) => pool.query('DELETE FROM push_inscricoes WHERE id_inscricao = $1', [idInscricao]),
    registrarEnvio: (idInscricao) => pool.query('UPDATE push_inscricoes SET ultimo_envio = CURRENT_TIMESTAMP WHERE id_inscricao = $1', [idInscricao]),

    // ---------------------------------------------------------
    // Destinatários
    // ---------------------------------------------------------
    // Logins ativos das pessoas destes voluntários
    usuariosDosVoluntarios: async (idsVoluntarios) => {
        if (!idsVoluntarios.length) return [];
        const result = await pool.query(
            `SELECT DISTINCT u.id_usuario FROM usuarios u
             JOIN voluntarios v ON v.id_membro = u.id_membro
             WHERE v.id_voluntario = ANY($1::int[]) AND u.ativo`,
            [idsVoluntarios]
        );
        return result.rows.map(r => r.id_usuario);
    },

    // Liderança das escalas: administradores e equipe com a área Escalas
    lideranca: async () => {
        const result = await pool.query(
            `SELECT id_usuario FROM usuarios
             WHERE ativo AND perfil <> 'VOLUNTARIO'
               AND (perfil = 'ADMINISTRADOR' OR (permissoes->>'escalas')::boolean IS TRUE)`
        );
        return result.rows.map(r => r.id_usuario);
    },

    // ---------------------------------------------------------
    // Dados para montar as mensagens
    // ---------------------------------------------------------
    escalaInfo: async (idEscala) => {
        const result = await pool.query(
            `SELECT e.nome AS evento, to_char(es.data_escala, 'YYYY-MM-DD') AS data, f.nome AS funcao, es.horario
             FROM escalas es LEFT JOIN eventos e ON e.id_evento = es.id_evento
             LEFT JOIN funcoes f ON f.id_funcao = es.id_funcao
             WHERE es.id_escala = $1`,
            [idEscala]
        );
        return result.rows[0] || null;
    },

    // Evento + voluntários escalados nele (sem quem recusou)
    escaladosDoEvento: async (idEvento) => {
        const evento = (await pool.query(
            `SELECT nome AS evento, to_char(data_evento, 'YYYY-MM-DD') AS data, hora_inicio
             FROM eventos WHERE id_evento = $1`,
            [idEvento]
        )).rows[0];
        if (!evento) return null;
        const voluntarios = (await pool.query(
            `SELECT DISTINCT ep.id_voluntario FROM escala_participantes ep
             JOIN escalas es ON es.id_escala = ep.id_escala
             WHERE es.id_evento = $1 AND NOT ep.recusado`,
            [idEvento]
        )).rows.map(r => r.id_voluntario);
        return { ...evento, voluntarios };
    },

    nomeDoVoluntario: async (idVoluntario) => {
        const result = await pool.query(
            'SELECT m.nome_completo FROM voluntarios v JOIN membros m ON m.id_membro = v.id_membro WHERE v.id_voluntario = $1',
            [idVoluntario]
        );
        return result.rows[0]?.nome_completo || 'Um voluntário';
    },

    // ---------------------------------------------------------
    // Lembretes automáticos (sem repetir)
    // ---------------------------------------------------------
    // Grava a chave; devolve true só na primeira vez (quem ganhar envia)
    reservarAviso: async (chave) => {
        const result = await pool.query(
            'INSERT INTO avisos_enviados (chave) VALUES ($1) ON CONFLICT (chave) DO NOTHING RETURNING chave',
            [chave]
        );
        return result.rowCount > 0;
    },

    // Atribuições de uma data que ainda contam (não recusadas)
    escaladosNaData: async (data) => {
        const result = await pool.query(
            `SELECT ep.id_escala, ep.id_voluntario, ep.confirmado, es.horario,
                    e.nome AS evento, f.nome AS funcao
             FROM escala_participantes ep
             JOIN escalas es ON es.id_escala = ep.id_escala
             LEFT JOIN eventos e ON e.id_evento = es.id_evento
             LEFT JOIN funcoes f ON f.id_funcao = es.id_funcao
             WHERE es.data_escala = $1 AND NOT ep.recusado`,
            [data]
        );
        return result.rows;
    },

    // Pendências (sem resposta) entre duas datas, para o resumo da liderança
    pendenciasEntre: async (inicio, fim) => {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS pendentes, COUNT(DISTINCT es.id_evento)::int AS eventos
             FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
             WHERE es.data_escala BETWEEN $1 AND $2 AND ep.confirmado IS NOT TRUE AND NOT ep.recusado`,
            [inicio, fim]
        );
        return result.rows[0];
    }
};

module.exports = notificacoesModel;
