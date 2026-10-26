// =========================================================
// Dados de teste do portal do voluntário (pode rodar de novo:
// só cria o que ainda não existe).
//
// Logins criados (senha de teste: Teste@123):
//   voluntario1@novocaminho.org, voluntario2@..., voluntario3@...
// =========================================================

const pool = require('../src/config/db');
const { gerarHashSenha } = require('../src/config/seguranca');

const SENHA_TESTE = 'Teste@123';
const PERMISSOES = { participantes: false, voluntarios: false, escalas: false, criancas: false, relatorios: false, usuarios: false };
const MOTIVOS_RECUSA = ['Viagem a trabalho nesse fim de semana', 'Consulta médica marcada no horário', 'Aniversário na família'];
const MOTIVOS_AUSENCIA = ['Férias', 'Viagem em família', 'Cirurgia e recuperação'];

(async () => {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');

        // Um voluntário ativo de departamentos diferentes, que tenha escalas futuras
        const voluntarios = (await cliente.query(
            `SELECT DISTINCT ON (d.nome) v.id_voluntario, v.id_membro, m.nome_completo, m.telefone
             FROM voluntarios v
             JOIN membros m ON m.id_membro = v.id_membro
             JOIN departamentos d ON d.id_departamento = v.id_departamento
             WHERE v.ativo AND d.nome IN ('Louvor', 'Recepção', 'Kids')
               AND EXISTS (SELECT 1 FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
                           WHERE ep.id_voluntario = v.id_voluntario AND es.data_escala >= CURRENT_DATE)
             ORDER BY d.nome, v.id_voluntario`
        )).rows;

        let logins = 0;
        for (const [i, v] of voluntarios.entries()) {
            const email = `voluntario${i + 1}@novocaminho.org`;
            const existe = await cliente.query('SELECT 1 FROM usuarios WHERE email = $1 OR id_membro = $2', [email, v.id_membro]);
            if (existe.rowCount) continue;
            await cliente.query(
                `INSERT INTO usuarios (nome, email, telefone, senha_hash, perfil, ativo, permissoes, observacoes, id_membro)
                 VALUES ($1, $2, $3, $4, 'VOLUNTARIO', TRUE, $5, 'Acesso ao portal do voluntário', $6)`,
                [v.nome_completo, email, v.telefone, await gerarHashSenha(SENHA_TESTE), PERMISSOES, v.id_membro]
            );
            logins++;
        }

        // Algumas recusas em escalas futuras (só se ainda não houver nenhuma)
        let recusas = 0;
        if (!(await cliente.query('SELECT 1 FROM escala_participantes WHERE recusado LIMIT 1')).rowCount) {
            const alvo = (await cliente.query(
                `SELECT ep.id_escala, ep.id_voluntario FROM escala_participantes ep
                 JOIN escalas es ON es.id_escala = ep.id_escala
                 WHERE es.data_escala BETWEEN CURRENT_DATE + 3 AND CURRENT_DATE + 30 AND NOT ep.confirmado
                 ORDER BY es.data_escala, ep.id_voluntario LIMIT 3`
            )).rows;
            for (const [i, p] of alvo.entries()) {
                await cliente.query(
                    `UPDATE escala_participantes SET recusado = TRUE, motivo_recusa = $3, respondido_em = CURRENT_TIMESTAMP
                     WHERE id_escala = $1 AND id_voluntario = $2`,
                    [p.id_escala, p.id_voluntario, MOTIVOS_RECUSA[i]]
                );
                recusas++;
            }
        }

        // Ausências futuras informadas (só se ainda não houver nenhuma)
        let ausencias = 0;
        if (!(await cliente.query('SELECT 1 FROM voluntario_ausencias LIMIT 1')).rowCount) {
            const alvo = (await cliente.query('SELECT id_voluntario FROM voluntarios WHERE ativo ORDER BY id_voluntario DESC LIMIT 3')).rows;
            for (const [i, v] of alvo.entries()) {
                await cliente.query(
                    `INSERT INTO voluntario_ausencias (id_voluntario, data_inicio, data_fim, motivo)
                     VALUES ($1, CURRENT_DATE + $2::int, CURRENT_DATE + $3::int, $4)`,
                    [v.id_voluntario, 10 + i * 12, 20 + i * 12, MOTIVOS_AUSENCIA[i]]
                );
                ausencias++;
            }
        }

        await cliente.query('COMMIT');
        console.log(`Portal do voluntário: ${logins} login(s), ${recusas} recusa(s), ${ausencias} ausência(s) criados.`);
    } catch (error) {
        await cliente.query('ROLLBACK');
        console.error('Erro no seed do voluntário — nada foi gravado:', error.message);
        process.exitCode = 1;
    } finally {
        cliente.release();
        await pool.end();
    }
})();
