const pool = require('../config/db');
const { CRITERIOS } = require('./pessoasModel');

// Monta o "WHERE" de cada relatório com parâmetros ($1, $2...) — nunca concatena valores
function construtor() {
    const condicoes = [];
    const valores = [];
    return {
        valores,
        add(sql, ...params) {
            const indices = params.map(p => { valores.push(p); return '$' + valores.length; });
            condicoes.push(sql.replace(/\?/g, () => indices.shift()));
        },
        where() { return condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : ''; }
    };
}

// Período: aplica em uma coluna de data quando informado
function periodo(w, coluna, f) {
    if (f.inicio) w.add(`${coluna} >= ?`, f.inicio);
    if (f.fim) w.add(`${coluna} <= ?`, f.fim);
}

const RELATORIOS = {
    participantes: {
        titulo: 'Participantes',
        colunas: [['nome', 'Nome'], ['tipo', 'Tipo'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['data', 'Entrada / visita'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            if (f.tipo === 'membros') w.add("tipo = 'Membro'");
            if (f.tipo === 'visitantes') w.add("tipo = 'Visitante'");
            if (f.status === 'ativos') w.add("status = 'Ativo'");
            if (f.status === 'inativos') w.add("status = 'Inativo'");
            periodo(w, 'data', f);
            // Todas as pessoas da base universal (membros e visitantes)
            return [`SELECT * FROM (
                        SELECT nome_completo AS nome, CASE WHEN classificacao = 'membro' THEN 'Membro' ELSE 'Visitante' END AS tipo,
                               telefone, email,
                               CASE WHEN classificacao = 'membro' THEN data_entrada_igreja ELSE data_primeira_visita END AS data,
                               CASE WHEN ativo THEN 'Ativo' ELSE 'Inativo' END AS status
                        FROM membros
                    ) p ${w.where()} ORDER BY data DESC NULLS LAST, nome`, w.valores];
        }
    },

    voluntarios: {
        titulo: 'Voluntários',
        colunas: [['nome', 'Nome'], ['departamento', 'Departamento'], ['funcoes', 'Funções'], ['disponibilidade', 'Disponibilidade'], ['escalas', 'Escalas no período'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            w.add(CRITERIOS.voluntarioElegivel); // voluntário = pessoa ativa e apta
            if (f.status === 'ativos') w.add('v.ativo');
            if (f.status === 'inativos') w.add('NOT v.ativo');
            if (f.id_funcao) w.add('EXISTS (SELECT 1 FROM voluntario_funcoes x WHERE x.id_voluntario = v.id_voluntario AND x.id_funcao = ?)', f.id_funcao);
            const p = construtor();
            p.valores.push(...w.valores);
            const ini = f.inicio ? (p.valores.push(f.inicio), '$' + p.valores.length) : 'NULL';
            const fim = f.fim ? (p.valores.push(f.fim), '$' + p.valores.length) : 'NULL';
            return [`SELECT m.nome_completo AS nome, d.nome AS departamento,
                            (SELECT string_agg(fn.nome, ', ' ORDER BY fn.nome) FROM voluntario_funcoes vf
                             JOIN funcoes fn ON fn.id_funcao = vf.id_funcao WHERE vf.id_voluntario = v.id_voluntario) AS funcoes,
                            array_to_string(v.disponibilidade, ', ') AS disponibilidade,
                            (SELECT COUNT(*) FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
                             WHERE ep.id_voluntario = v.id_voluntario
                               AND (${ini}::date IS NULL OR es.data_escala >= ${ini}::date)
                               AND (${fim}::date IS NULL OR es.data_escala <= ${fim}::date))::int AS escalas,
                            CASE WHEN v.ativo THEN 'Ativo' ELSE 'Inativo' END AS status
                     FROM voluntarios v
                     JOIN membros m ON m.id_membro = v.id_membro
                     LEFT JOIN departamentos d ON d.id_departamento = v.id_departamento
                     ${w.where()}
                     ORDER BY m.nome_completo`, p.valores];
        }
    },

    escalas: {
        titulo: 'Escalas',
        colunas: [['data', 'Data'], ['evento', 'Evento'], ['funcao', 'Função'], ['horario', 'Horário'], ['voluntario', 'Voluntário'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            if (f.status === 'confirmadas') w.add('ep.confirmado IS TRUE');
            if (f.status === 'pendentes') w.add('ep.confirmado IS NOT TRUE AND NOT ep.recusado');
            if (f.status === 'recusadas') w.add('ep.recusado');
            if (f.id_funcao) w.add('es.id_funcao = ?', f.id_funcao);
            periodo(w, 'es.data_escala', f);
            return [`SELECT es.data_escala AS data, e.nome AS evento, fn.nome AS funcao, to_char(es.horario, 'HH24:MI') AS horario,
                            m.nome_completo AS voluntario,
                            CASE WHEN ep.confirmado THEN 'Confirmado'
                                 WHEN ep.recusado THEN 'Recusou: ' || COALESCE(ep.motivo_recusa, '')
                                 WHEN es.data_escala < CURRENT_DATE THEN 'Ausente'
                                 ELSE 'Pendente' END AS status
                     FROM escala_participantes ep
                     JOIN escalas es ON es.id_escala = ep.id_escala
                     LEFT JOIN eventos e ON e.id_evento = es.id_evento
                     LEFT JOIN funcoes fn ON fn.id_funcao = ep.id_funcao
                     JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
                     JOIN membros m ON m.id_membro = v.id_membro
                     ${w.where()}
                     ORDER BY es.data_escala ${f.status === 'pendentes' ? 'ASC' /* as mais próximas primeiro */ : 'DESC'}, es.horario, fn.nome, m.nome_completo`, w.valores];
        }
    },

    presencas: {
        titulo: 'Presenças',
        colunas: [['data', 'Data'], ['turma', 'Turma'], ['membro', 'Membro'], ['entrada', 'Entrada'], ['saida', 'Saída']],
        consulta(f) {
            const w = construtor();
            if (f.id_turma) w.add('p.id_turma = ?', f.id_turma);
            periodo(w, 'p.data', f);
            return [`SELECT p.data, c.nome AS turma, m.nome_completo AS membro,
                            to_char(p.hora_entrada, 'HH24:MI') AS entrada, to_char(p.hora_saida, 'HH24:MI') AS saida
                     FROM turmas p
                     JOIN cadastroturmas c ON c.id_turma = p.id_turma
                     JOIN membros m ON m.id_membro = p.id_membro
                     ${w.where()}
                     ORDER BY p.data DESC, c.nome, m.nome_completo`, w.valores];
        }
    },

    criancas: {
        titulo: 'Crianças',
        colunas: [['nome', 'Nome'], ['idade', 'Idade'], ['turma', 'Turma'], ['responsavel', 'Responsável'], ['telefone', 'Telefone'], ['presencas', 'Presenças no período'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            w.add(CRITERIOS.menor); // crianças = menos de 18 anos, pela data de nascimento
            if (f.id_turma) w.add('c.id_turma = ?', f.id_turma);
            if (f.status === 'ativos') w.add('(m.ativo AND COALESCE(c.ativo, TRUE))');
            if (f.status === 'inativos') w.add('NOT (m.ativo AND COALESCE(c.ativo, TRUE))');
            const ini = f.inicio ? (w.valores.push(f.inicio), '$' + w.valores.length) : 'NULL';
            const fim = f.fim ? (w.valores.push(f.fim), '$' + w.valores.length) : 'NULL';
            return [`SELECT m.nome_completo AS nome, ${CRITERIOS.idade} AS idade,
                            t.nome AS turma, r.nome_completo AS responsavel, r.telefone,
                            (SELECT COUNT(*) FROM turmas p WHERE p.id_membro = m.id_membro
                               AND (${ini}::date IS NULL OR p.data >= ${ini}::date)
                               AND (${fim}::date IS NULL OR p.data <= ${fim}::date))::int AS presencas,
                            CASE WHEN m.ativo AND COALESCE(c.ativo, TRUE) THEN 'Ativo' ELSE 'Inativo' END AS status
                     FROM membros m
                     LEFT JOIN criancas c ON c.id_membro = m.id_membro
                     LEFT JOIN cadastroturmas t ON t.id_turma = c.id_turma
                     LEFT JOIN LATERAL (
                         SELECT rs.nome_completo, rs.telefone FROM crianca_responsavel cr
                         JOIN responsaveis rs ON rs.id_responsavel = cr.id_responsavel
                         WHERE cr.id_crianca = c.id_crianca ORDER BY cr.responsavel_principal DESC LIMIT 1
                     ) r ON TRUE
                     ${w.where()}
                     ORDER BY t.nome NULLS LAST, m.nome_completo`, w.valores];
        }
    },

    funcoes: {
        titulo: 'Funções',
        colunas: [['nome', 'Função'], ['descricao', 'Descrição'], ['por_escala', 'Por escala'], ['vagas', 'Vagas'], ['voluntarios', 'Voluntários'], ['vagas_abertas', 'Vagas abertas'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            if (f.status === 'ativas') w.add("status = 'Ativa'");
            if (f.status === 'inativas') w.add("status = 'Inativa'");
            if (f.vagas === 'com_vagas') w.add('vagas_abertas > 0');
            if (f.vagas === 'lotadas') w.add('vagas_abertas = 0');
            return [`SELECT * FROM (
                        SELECT f.nome, f.descricao, f.qtd_voluntarios AS por_escala, f.vagas,
                               COUNT(v.id_voluntario) FILTER (WHERE v.ativo)::int AS voluntarios,
                               GREATEST(COALESCE(f.vagas, 0) - COUNT(v.id_voluntario) FILTER (WHERE v.ativo), 0)::int AS vagas_abertas,
                               CASE WHEN f.ativo THEN 'Ativa' ELSE 'Inativa' END AS status
                        FROM funcoes f
                        LEFT JOIN voluntario_funcoes vf ON vf.id_funcao = f.id_funcao
                        LEFT JOIN voluntarios v ON v.id_voluntario = vf.id_voluntario
                        GROUP BY f.id_funcao
                    ) x ${w.where()} ORDER BY nome`, w.valores];
        }
    },

    usuarios: {
        titulo: 'Usuários',
        colunas: [['nome', 'Nome'], ['email', 'E-mail'], ['perfil', 'Perfil'], ['status', 'Status'], ['ultimo_acesso', 'Último acesso'], ['criado_em', 'Criado em']],
        consulta(f) {
            const w = construtor();
            if (f.perfil) w.add('perfil = ?', f.perfil);
            if (f.status === 'ativos') w.add('ativo');
            if (f.status === 'inativos') w.add('NOT ativo AND ultimo_acesso IS NOT NULL');
            if (f.status === 'pendentes') w.add('NOT ativo AND ultimo_acesso IS NULL');
            periodo(w, 'criado_em::date', f);
            return [`SELECT nome, email, perfil,
                            CASE WHEN ativo THEN 'Ativo' WHEN ultimo_acesso IS NULL THEN 'Pendente' ELSE 'Inativo' END AS status,
                            to_char(ultimo_acesso, 'DD/MM/YYYY HH24:MI') AS ultimo_acesso, criado_em::date AS criado_em
                     FROM usuarios ${w.where()} ORDER BY nome`, w.valores];
        }
    }
};

const relatoriosModel = {
    tipos: Object.keys(RELATORIOS),

    gerar: async (tipo, filtros) => {
        const relatorio = RELATORIOS[tipo];
        const [sql, valores] = relatorio.consulta(filtros);
        const result = await pool.query(sql, valores);
        return {
            tipo,
            titulo: relatorio.titulo,
            colunas: relatorio.colunas.map(([chave, titulo]) => ({ chave, titulo })),
            linhas: result.rows
        };
    },

    resumo: async () => {
        const result = await pool.query(
            `SELECT (SELECT COUNT(*) FROM membros) AS participantes,
                    (SELECT COUNT(*) FROM membros m WHERE ${CRITERIOS.voluntarioElegivel}) AS voluntarios,
                    (SELECT COUNT(*) FROM escalas) AS escalas,
                    (SELECT COUNT(*) FROM membros m WHERE ${CRITERIOS.menor} AND m.ativo) AS criancas`
        );
        return result.rows[0];
    },

    recentes: async () => {
        const result = await pool.query(
            `SELECT r.*, u.nome AS usuario
             FROM relatorios_gerados r LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
             ORDER BY r.gerado_em DESC LIMIT 10`
        );
        return result.rows;
    },

    registrar: async ({ tipo, data_inicial, data_final, formato, filtros, total_registros, id_usuario }) => {
        const result = await pool.query(
            `INSERT INTO relatorios_gerados (tipo, data_inicial, data_final, formato, filtros, total_registros, id_usuario)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [tipo, data_inicial, data_final, formato, filtros, total_registros, id_usuario]
        );
        return result.rows[0];
    }
};

module.exports = relatoriosModel;
