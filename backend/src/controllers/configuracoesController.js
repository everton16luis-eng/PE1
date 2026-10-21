const Configuracoes = require('../models/configuracoesModel');
const { responderErro } = require('../config/erros');
const { executarBackup } = require('../config/backup');

const HORA = /^\d{2}:\d{2}(:\d{2})?$/;
const texto = valor => String(valor ?? '').trim() || null;

exports.getConfiguracoes = async (req, res) => {
    try {
        res.json(await Configuracoes.buscar() || {});
    } catch (error) {
        console.error('Erro ao carregar configurações', error);
        responderErro(res, error);
    }
}

exports.salvarConfiguracoes = async (req, res) => {
    try {
        const b = req.body;
        const dados = {
            nome_igreja: texto(b.nome_igreja),
            cnpj: texto(b.cnpj),
            telefone: texto(b.telefone),
            endereco: texto(b.endereco),
            cidade: texto(b.cidade),
            estado: texto(b.estado),
            horario_principal: HORA.test(b.horario_principal || '') ? b.horario_principal : null,
            fuso_horario: texto(b.fuso_horario) || 'America/Sao_Paulo',
            notificacoes: Boolean(b.notificacoes),
            notificacoes_email: Boolean(b.notificacoes_email)
        };
        if (!dados.nome_igreja) return res.status(400).json({ erro: 'Informe o nome da igreja.' });
        if (dados.cnpj && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(dados.cnpj)) {
            return res.status(400).json({ erro: 'CNPJ deve estar no formato 00.000.000/0000-00.' });
        }

        res.json(await Configuracoes.salvar(dados));
    } catch (error) {
        console.error('Erro ao salvar configurações', error);
        responderErro(res, error);
    }
}

exports.fazerBackup = async (req, res) => {
    try {
        const backup = await executarBackup();
        const datas = await Configuracoes.registrarBackup();
        res.json({ ...backup, ...datas });
    } catch (error) {
        console.error('Erro ao executar backup', error);
        res.status(500).json({ erro: 'Não foi possível gerar o backup. Confira se o pg_dump está instalado (detalhes no log do servidor).' });
    }
}

// Verifica a cada 15 minutos se chegou a hora do backup automático
exports.iniciarBackupAutomatico = () => {
    const verificar = async () => {
        try {
            const config = await Configuracoes.buscar();
            if (config?.proximo_backup && new Date(config.proximo_backup) <= new Date()) {
                const backup = await executarBackup();
                await Configuracoes.registrarBackup();
                console.log(`Backup automático concluído: ${backup.arquivo}`);
            }
        } catch (error) {
            console.error('Backup automático falhou:', error.message);
        }
    };
    setInterval(verificar, 15 * 60 * 1000).unref();
}
