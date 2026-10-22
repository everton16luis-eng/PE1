// =========================================================
// Regras de acesso, num lugar só (usadas pelos middlewares,
// pelo cadastro e pelo /auth/me).
//
// Ativação (usuarios.ativo) e autorização são coisas separadas:
// estar ativo só permite entrar; o que a pessoa vê depende do
// perfil e das áreas marcadas em usuarios.permissoes.
// =========================================================

const AREAS = ['participantes', 'voluntarios', 'escalas', 'criancas', 'relatorios', 'usuarios'];

// Usuário padrão (conta criada pela tela de login): ativo, sem nenhuma área
const PERMISSOES_PADRAO = Object.freeze(Object.fromEntries(AREAS.map(area => [area, false])));
const PERMISSOES_ADMIN = Object.freeze(Object.fromEntries(AREAS.map(area => [area, true])));

// Equipe de gestão = administrador, ou login de gestão com pelo menos uma área liberada.
// Os demais (perfil Voluntário e usuários sem nenhuma área) só usam a Minha área.
function ehEquipeDeGestao(usuario) {
    if (!usuario) return false;
    if (usuario.perfil === 'ADMINISTRADOR') return true;
    if (usuario.perfil === 'VOLUNTARIO') return false;
    return AREAS.some(area => usuario.permissoes?.[area] === true);
}

module.exports = { AREAS, PERMISSOES_PADRAO, PERMISSOES_ADMIN, ehEquipeDeGestao };
