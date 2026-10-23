-- =========================================================
-- INSTALAÇÃO NOVA (banco limpo)
-- Estrutura completa + dados iniciais (dados-iniciais.sql).
-- Nenhuma pessoa, login, evento, escala ou lançamento financeiro.
-- Arquivo gerado por: npm run db:gerar-instalacao (não edite à mão)
--
-- Uso, num banco VAZIO:
--   createdb -U postgres igreja_sistema
--   npm run db:instalar
-- Depois, o primeiro cadastro na tela de login vira o administrador.
-- =========================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: avisos_enviados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avisos_enviados (
    chave character varying(120) NOT NULL,
    enviado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cadastroturmas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cadastroturmas (
    id_turma integer NOT NULL,
    nome character varying(100) NOT NULL,
    idade_minima integer,
    idade_maxima integer,
    id_membro_responsavel integer,
    dia_semana character varying(20) DEFAULT 'Domingo'::character varying NOT NULL,
    horario time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    observacoes text
);


--
-- Name: cadastroturmas_id_turma_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cadastroturmas_id_turma_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cadastroturmas_id_turma_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cadastroturmas_id_turma_seq OWNED BY public.cadastroturmas.id_turma;


--
-- Name: categorias_financeiras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_financeiras (
    id_categoria integer NOT NULL,
    nome character varying(100) NOT NULL,
    tipo character varying(20) NOT NULL,
    ativo boolean DEFAULT true,
    CONSTRAINT chk_categoria_tipo CHECK (((tipo)::text = ANY (ARRAY[('RECEITA'::character varying)::text, ('DESPESA'::character varying)::text])))
);


--
-- Name: categorias_financeiras_id_categoria_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categorias_financeiras_id_categoria_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categorias_financeiras_id_categoria_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categorias_financeiras_id_categoria_seq OWNED BY public.categorias_financeiras.id_categoria;


--
-- Name: configuracoes_igreja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracoes_igreja (
    id integer NOT NULL,
    nome_igreja character varying(255) NOT NULL,
    cnpj character varying(18),
    telefone character varying(20),
    endereco character varying(255),
    cidade character varying(100),
    estado character varying(100),
    horario_principal time without time zone,
    fuso_horario character varying(100) DEFAULT 'America/Sao_Paulo'::character varying,
    notificacoes boolean DEFAULT true,
    notificacoes_email boolean DEFAULT true,
    ultimo_backup timestamp without time zone,
    proximo_backup timestamp without time zone,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: configuracoes_igreja_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracoes_igreja_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracoes_igreja_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracoes_igreja_id_seq OWNED BY public.configuracoes_igreja.id;


--
-- Name: contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas (
    id_conta integer NOT NULL,
    descricao character varying(200) NOT NULL,
    tipo character varying(20) NOT NULL,
    valor numeric(12,2) NOT NULL,
    data_vencimento date NOT NULL,
    data_pagamento date,
    status character varying(20) DEFAULT 'PENDENTE'::character varying,
    id_categoria integer NOT NULL,
    id_fornecedor integer,
    observacoes text,
    CONSTRAINT chk_conta_tipo CHECK (((tipo)::text = ANY (ARRAY[('PAGAR'::character varying)::text, ('RECEBER'::character varying)::text])))
);


--
-- Name: contas_id_conta_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contas_id_conta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contas_id_conta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contas_id_conta_seq OWNED BY public.contas.id_conta;


--
-- Name: crianca_responsavel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crianca_responsavel (
    id_crianca integer NOT NULL,
    id_responsavel integer NOT NULL,
    responsavel_principal boolean DEFAULT false,
    autorizado_retirada boolean DEFAULT false NOT NULL,
    autorizacao_atualizada_em timestamp with time zone,
    autorizacao_atualizada_por integer
);


--
-- Name: criancas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.criancas (
    id_crianca integer NOT NULL,
    nome_completo character varying(150),
    data_nascimento date,
    observacoes text,
    ativo boolean DEFAULT true,
    id_membro integer NOT NULL,
    id_turma integer,
    sexo character varying(10),
    alergias text,
    data_cadastro date DEFAULT CURRENT_DATE,
    autorizacao_responsavel boolean DEFAULT false NOT NULL,
    autorizacao_imagem boolean DEFAULT false NOT NULL,
    CONSTRAINT criancas_sexo_check CHECK (((sexo IS NULL) OR ((sexo)::text = ANY ((ARRAY['feminino'::character varying, 'masculino'::character varying])::text[]))))
);


--
-- Name: COLUMN criancas.nome_completo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.criancas.nome_completo IS 'Legado. O nome oficial está em membros (base universal).';


--
-- Name: COLUMN criancas.data_nascimento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.criancas.data_nascimento IS 'Legado. A data oficial está em membros (base universal).';


--
-- Name: criancas_id_crianca_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.criancas_id_crianca_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: criancas_id_crianca_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.criancas_id_crianca_seq OWNED BY public.criancas.id_crianca;


--
-- Name: departamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departamentos (
    id_departamento integer NOT NULL,
    nome character varying(100) NOT NULL,
    descricao text,
    ativo boolean DEFAULT true
);


--
-- Name: departamentos_id_departamento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departamentos_id_departamento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departamentos_id_departamento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departamentos_id_departamento_seq OWNED BY public.departamentos.id_departamento;


--
-- Name: documentos_financeiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_financeiros (
    id_documento integer NOT NULL,
    id_movimentacao integer,
    id_conta integer,
    tipo_documento character varying(50) NOT NULL,
    numero_documento character varying(100),
    caminho_arquivo character varying(500),
    data_documento date,
    observacoes text,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: documentos_financeiros_id_documento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documentos_financeiros_id_documento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documentos_financeiros_id_documento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documentos_financeiros_id_documento_seq OWNED BY public.documentos_financeiros.id_documento;


--
-- Name: escala_participantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escala_participantes (
    id_escala integer NOT NULL,
    id_voluntario integer NOT NULL,
    id_funcao integer NOT NULL,
    confirmado boolean DEFAULT false,
    recusado boolean DEFAULT false NOT NULL,
    motivo_recusa text,
    respondido_em timestamp without time zone
);


--
-- Name: escala_trocas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escala_trocas (
    id_troca integer NOT NULL,
    id_escala integer NOT NULL,
    id_voluntario_saiu integer NOT NULL,
    id_voluntario_entrou integer NOT NULL,
    feita_por character varying(20) NOT NULL,
    id_usuario integer,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT escala_trocas_feita_por_check CHECK (((feita_por)::text = ANY ((ARRAY['voluntario'::character varying, 'equipe'::character varying])::text[])))
);


--
-- Name: escala_trocas_id_troca_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escala_trocas_id_troca_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escala_trocas_id_troca_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escala_trocas_id_troca_seq OWNED BY public.escala_trocas.id_troca;


--
-- Name: escalas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escalas (
    id_escala integer NOT NULL,
    id_evento integer,
    id_funcao integer,
    qtd_voluntarios integer,
    data_escala date,
    horario time without time zone,
    descricao character varying(255),
    observacoes text,
    CONSTRAINT escalas_qtd_voluntarios_check CHECK ((qtd_voluntarios > 0))
);


--
-- Name: escalas_id_escala_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escalas_id_escala_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escalas_id_escala_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escalas_id_escala_seq OWNED BY public.escalas.id_escala;


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos (
    id_evento integer NOT NULL,
    nome character varying(150) NOT NULL,
    data_evento date NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    hora_inicio time without time zone,
    hora_fim time without time zone,
    tipo_evento character varying(100)
);


--
-- Name: eventos_id_evento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eventos_id_evento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eventos_id_evento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eventos_id_evento_seq OWNED BY public.eventos.id_evento;


--
-- Name: fornecedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fornecedores (
    id_fornecedor integer NOT NULL,
    razao_social character varying(150) NOT NULL,
    nome_fantasia character varying(150),
    cpf_cnpj character varying(20),
    telefone character varying(20),
    email character varying(150),
    endereco character varying(255),
    ativo boolean DEFAULT true
);


--
-- Name: fornecedores_id_fornecedor_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fornecedores_id_fornecedor_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fornecedores_id_fornecedor_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fornecedores_id_fornecedor_seq OWNED BY public.fornecedores.id_fornecedor;


--
-- Name: funcoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funcoes (
    id_funcao integer NOT NULL,
    nome character varying(100) NOT NULL,
    descricao text,
    ativo boolean DEFAULT true,
    qtd_voluntarios integer DEFAULT 1 NOT NULL,
    vagas integer,
    dias_disponiveis character varying(10)[] DEFAULT '{}'::character varying[] NOT NULL,
    observacoes text,
    CONSTRAINT funcoes_vagas_check CHECK (((vagas IS NULL) OR (vagas >= 0)))
);


--
-- Name: funcoes_id_funcao_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.funcoes_id_funcao_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: funcoes_id_funcao_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.funcoes_id_funcao_seq OWNED BY public.funcoes.id_funcao;


--
-- Name: membros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membros (
    id_membro integer NOT NULL,
    nome_completo character varying(150) NOT NULL,
    data_nascimento date,
    telefone character varying(20),
    email character varying(150),
    endereco character varying(255),
    estado_civil character varying(30),
    data_entrada_igreja date,
    informacoes_batismo text,
    ativo boolean DEFAULT true,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    apto_voluntario boolean DEFAULT false NOT NULL,
    voluntario boolean DEFAULT false NOT NULL,
    participa_celula boolean,
    observacoes text,
    classificacao character varying(20) DEFAULT 'membro'::character varying NOT NULL,
    data_primeira_visita date,
    CONSTRAINT chk_membros_classificacao CHECK (((classificacao)::text = ANY ((ARRAY['visitante'::character varying, 'membro'::character varying])::text[])))
);


--
-- Name: TABLE membros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.membros IS 'Cadastro universal de pessoas (visitantes e membros). Crianças, voluntários e logins apontam para cá.';


--
-- Name: membros_id_membro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.membros_id_membro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: membros_id_membro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.membros_id_membro_seq OWNED BY public.membros.id_membro;


--
-- Name: movimentacoes_financeiras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimentacoes_financeiras (
    id_movimentacao integer NOT NULL,
    data_movimentacao date NOT NULL,
    tipo character varying(20) NOT NULL,
    descricao character varying(255) NOT NULL,
    valor numeric(12,2) NOT NULL,
    id_categoria integer NOT NULL,
    id_conta integer,
    forma_pagamento character varying(50),
    observacoes text,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_movimentacao_tipo CHECK (((tipo)::text = ANY (ARRAY[('RECEITA'::character varying)::text, ('DESPESA'::character varying)::text])))
);


--
-- Name: movimentacoes_financeiras_id_movimentacao_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimentacoes_financeiras_id_movimentacao_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimentacoes_financeiras_id_movimentacao_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimentacoes_financeiras_id_movimentacao_seq OWNED BY public.movimentacoes_financeiras.id_movimentacao;


--
-- Name: notificacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacoes (
    id_notificacao integer NOT NULL,
    id_usuario integer NOT NULL,
    tipo character varying(40) NOT NULL,
    titulo character varying(150) NOT NULL,
    mensagem character varying(500) NOT NULL,
    rota character varying(80),
    lida boolean DEFAULT false NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notificacoes_id_notificacao_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificacoes_id_notificacao_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificacoes_id_notificacao_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificacoes_id_notificacao_seq OWNED BY public.notificacoes.id_notificacao;


--
-- Name: push_inscricoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_inscricoes (
    id_inscricao integer NOT NULL,
    id_usuario integer NOT NULL,
    endpoint text NOT NULL,
    p256dh character varying(200) NOT NULL,
    auth character varying(100) NOT NULL,
    aparelho character varying(200),
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ultimo_envio timestamp without time zone
);


--
-- Name: push_inscricoes_id_inscricao_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_inscricoes_id_inscricao_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_inscricoes_id_inscricao_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_inscricoes_id_inscricao_seq OWNED BY public.push_inscricoes.id_inscricao;


--
-- Name: relatorios_gerados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relatorios_gerados (
    id_relatorio integer NOT NULL,
    tipo character varying(30) NOT NULL,
    data_inicial date,
    data_final date,
    formato character varying(10) NOT NULL,
    filtros jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_registros integer,
    id_usuario integer,
    gerado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    titulo character varying(255),
    id_evento integer,
    arquivo character varying(255),
    nome_arquivo character varying(255),
    tamanho_bytes integer,
    hash_arquivo character varying(64),
    CONSTRAINT relatorios_gerados_formato_check CHECK (((formato)::text = ANY ((ARRAY['pdf'::character varying, 'excel'::character varying, 'csv'::character varying])::text[])))
);


--
-- Name: relatorios_gerados_id_relatorio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.relatorios_gerados_id_relatorio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: relatorios_gerados_id_relatorio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.relatorios_gerados_id_relatorio_seq OWNED BY public.relatorios_gerados.id_relatorio;


--
-- Name: responsaveis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.responsaveis (
    id_responsavel integer NOT NULL,
    nome_completo character varying(150) NOT NULL,
    telefone character varying(20),
    email character varying(150),
    parentesco character varying(50),
    ativo boolean DEFAULT true
);


--
-- Name: responsaveis_id_responsavel_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.responsaveis_id_responsavel_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: responsaveis_id_responsavel_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.responsaveis_id_responsavel_seq OWNED BY public.responsaveis.id_responsavel;


--
-- Name: turma_alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turma_alertas (
    id_alerta integer NOT NULL,
    id_sessao integer NOT NULL,
    motivo character varying(30) NOT NULL,
    prioritario boolean DEFAULT false NOT NULL,
    presentes_no_encerramento integer DEFAULT 0 NOT NULL,
    saidas_regularizadas integer DEFAULT 0 NOT NULL,
    deveria_encerrar_em timestamp with time zone NOT NULL,
    encerrada_em timestamp with time zone NOT NULL,
    processada_em timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(10) DEFAULT 'pendente'::character varying NOT NULL,
    tratado_por integer,
    tratado_em timestamp with time zone,
    observacao_tratamento text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turma_alertas_motivo_check CHECK (((motivo)::text = ANY ((ARRAY['limite_diario'::character varying, 'fim_evento'::character varying, 'sessao_abandonada'::character varying])::text[]))),
    CONSTRAINT turma_alertas_status_check CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'tratado'::character varying])::text[])))
);


--
-- Name: turma_alertas_id_alerta_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turma_alertas_id_alerta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turma_alertas_id_alerta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turma_alertas_id_alerta_seq OWNED BY public.turma_alertas.id_alerta;


--
-- Name: turma_atendimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turma_atendimentos (
    id_atendimento integer NOT NULL,
    id_sessao integer NOT NULL,
    id_crianca integer NOT NULL,
    entrada_em timestamp with time zone DEFAULT now() NOT NULL,
    entrada_por integer NOT NULL,
    saida_em timestamp with time zone,
    saida_por integer,
    tipo_saida character varying(15),
    id_responsavel_retirada integer,
    CONSTRAINT turma_atendimentos_check CHECK (((saida_em IS NULL) = (tipo_saida IS NULL))),
    CONSTRAINT turma_atendimentos_tipo_saida_check CHECK (((tipo_saida)::text = ANY ((ARRAY['manual'::character varying, 'automatica'::character varying, 'administrativa'::character varying])::text[])))
);


--
-- Name: turma_atendimentos_id_atendimento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turma_atendimentos_id_atendimento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turma_atendimentos_id_atendimento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turma_atendimentos_id_atendimento_seq OWNED BY public.turma_atendimentos.id_atendimento;


--
-- Name: turma_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turma_auditoria (
    id_registro integer NOT NULL,
    id_sessao integer,
    id_atendimento integer,
    id_codigo integer,
    acao character varying(40) NOT NULL,
    detalhe text,
    id_usuario integer,
    automatico boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: turma_auditoria_id_registro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turma_auditoria_id_registro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turma_auditoria_id_registro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turma_auditoria_id_registro_seq OWNED BY public.turma_auditoria.id_registro;


--
-- Name: turma_codigos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turma_codigos (
    id_codigo integer NOT NULL,
    id_atendimento integer NOT NULL,
    id_sessao integer NOT NULL,
    codigo character varying(8) NOT NULL,
    token character varying(64) NOT NULL,
    id_responsavel integer,
    status character varying(12) DEFAULT 'ativo'::character varying NOT NULL,
    emitido_em timestamp with time zone DEFAULT now() NOT NULL,
    emitido_por integer NOT NULL,
    segunda_via_de integer,
    motivo_emissao text,
    utilizado_em timestamp with time zone,
    utilizado_por integer,
    invalidado_em timestamp with time zone,
    invalidado_por integer,
    motivo_invalidacao text,
    codigo_retirada character varying(8) NOT NULL,
    token_crianca character varying(64) NOT NULL,
    CONSTRAINT turma_codigos_status_check CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'utilizado'::character varying, 'invalidado'::character varying])::text[])))
);


--
-- Name: turma_codigos_id_codigo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turma_codigos_id_codigo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turma_codigos_id_codigo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turma_codigos_id_codigo_seq OWNED BY public.turma_codigos.id_codigo;


--
-- Name: turma_sessoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turma_sessoes (
    id_sessao integer NOT NULL,
    id_turma integer NOT NULL,
    id_evento integer NOT NULL,
    status character varying(10) DEFAULT 'aberta'::character varying NOT NULL,
    aberta_em timestamp with time zone DEFAULT now() NOT NULL,
    aberta_por integer NOT NULL,
    encerrada_em timestamp with time zone,
    encerrada_por integer,
    processada_em timestamp with time zone,
    tipo_encerramento character varying(30),
    motivo_encerramento text,
    CONSTRAINT turma_sessoes_check CHECK ((((status)::text = 'aberta'::text) = (encerrada_em IS NULL))),
    CONSTRAINT turma_sessoes_check1 CHECK ((((status)::text = 'aberta'::text) = (tipo_encerramento IS NULL))),
    CONSTRAINT turma_sessoes_status_check CHECK (((status)::text = ANY ((ARRAY['aberta'::character varying, 'encerrada'::character varying])::text[]))),
    CONSTRAINT turma_sessoes_tipo_encerramento_check CHECK (((tipo_encerramento)::text = ANY ((ARRAY['manual'::character varying, 'administrativo'::character varying, 'automatico_limite_diario'::character varying, 'automatico_fim_evento'::character varying])::text[])))
);


--
-- Name: turma_sessoes_id_sessao_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turma_sessoes_id_sessao_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turma_sessoes_id_sessao_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turma_sessoes_id_sessao_seq OWNED BY public.turma_sessoes.id_sessao;


--
-- Name: turma_voluntarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turma_voluntarios (
    id_turma integer NOT NULL,
    id_voluntario integer NOT NULL,
    vinculado_em timestamp with time zone DEFAULT now() NOT NULL,
    vinculado_por integer
);


--
-- Name: turmas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turmas (
    id_registro integer NOT NULL,
    id_turma integer NOT NULL,
    nome character varying(150) NOT NULL,
    id_membro integer NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    hora_entrada time without time zone DEFAULT CURRENT_TIME NOT NULL,
    hora_saida time without time zone
);


--
-- Name: turmas_id_registro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.turmas_id_registro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: turmas_id_registro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.turmas_id_registro_seq OWNED BY public.turmas.id_registro;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id_usuario integer NOT NULL,
    nome character varying(150) NOT NULL,
    email character varying(150) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    perfil character varying(30) NOT NULL,
    ativo boolean DEFAULT true,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    telefone character varying(20),
    ultimo_acesso timestamp without time zone,
    permissoes jsonb DEFAULT '{}'::jsonb NOT NULL,
    observacoes text,
    id_membro integer NOT NULL,
    CONSTRAINT chk_usuario_perfil CHECK (((perfil)::text = ANY ((ARRAY['ADMINISTRADOR'::character varying, 'GESTOR'::character varying, 'SECRETARIA'::character varying, 'FINANCEIRO'::character varying, 'VOLUNTARIO'::character varying, 'VISUALIZACAO'::character varying])::text[])))
);


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_usuario_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_usuario_seq OWNED BY public.usuarios.id_usuario;


--
-- Name: visitantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitantes (
    id_visitante integer NOT NULL,
    nome character varying(150) NOT NULL,
    telefone character varying(20),
    data_visita date NOT NULL,
    observacoes text,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    email character varying(150),
    data_nascimento date,
    estado_civil character varying(30),
    endereco character varying(255),
    id_membro integer,
    promovido_em timestamp without time zone
);


--
-- Name: visitantes_id_visitante_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visitantes_id_visitante_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visitantes_id_visitante_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visitantes_id_visitante_seq OWNED BY public.visitantes.id_visitante;


--
-- Name: voluntario_ausencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voluntario_ausencias (
    id_ausencia integer NOT NULL,
    id_voluntario integer NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    motivo character varying(200),
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_ausencia_periodo CHECK ((data_fim >= data_inicio))
);


--
-- Name: voluntario_ausencias_id_ausencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voluntario_ausencias_id_ausencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voluntario_ausencias_id_ausencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voluntario_ausencias_id_ausencia_seq OWNED BY public.voluntario_ausencias.id_ausencia;


--
-- Name: voluntario_funcoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voluntario_funcoes (
    id_voluntario integer NOT NULL,
    id_funcao integer NOT NULL
);


--
-- Name: voluntarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voluntarios (
    id_voluntario integer NOT NULL,
    id_membro integer NOT NULL,
    numero_mes_batizado integer DEFAULT 0,
    data_batismo date,
    data_inicio_voluntariado date NOT NULL,
    ativo boolean DEFAULT true,
    id_departamento integer,
    disponibilidade character varying(10)[] DEFAULT '{}'::character varying[] NOT NULL,
    observacoes text
);


--
-- Name: voluntarios_id_voluntario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voluntarios_id_voluntario_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voluntarios_id_voluntario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voluntarios_id_voluntario_seq OWNED BY public.voluntarios.id_voluntario;


--
-- Name: vw_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_dashboard AS
 SELECT ( SELECT count(*) AS count
           FROM public.membros
          WHERE ((membros.classificacao)::text = 'visitante'::text)) AS total_visitantes,
    ( SELECT count(*) AS count
           FROM public.membros
          WHERE ((membros.classificacao)::text = 'membro'::text)) AS total_membros,
    ( SELECT count(*) AS count
           FROM public.membros
          WHERE (membros.ativo AND membros.apto_voluntario)) AS total_voluntarios,
    ( SELECT count(*) AS count
           FROM (public.escalas e
             JOIN public.eventos ev ON ((ev.id_evento = e.id_evento)))
          WHERE ((ev.data_evento >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (ev.data_evento < (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval)))) AS total_escalas;


--
-- Name: vw_escalas_semana; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_escalas_semana AS
 SELECT e.id_escala,
    ev.data_evento AS data_escala,
    e.id_funcao,
    f.nome AS funcao,
    ev.hora_inicio AS horario,
    count(ep.id_voluntario) AS total_voluntarios,
    count(ep.id_voluntario) FILTER (WHERE (ep.confirmado IS TRUE)) AS confirmados,
    count(ep.id_voluntario) FILTER (WHERE (ep.confirmado IS NOT TRUE)) AS pendentes
   FROM (((public.escalas e
     JOIN public.eventos ev ON ((ev.id_evento = e.id_evento)))
     JOIN public.funcoes f ON ((f.id_funcao = e.id_funcao)))
     LEFT JOIN public.escala_participantes ep ON (((ep.id_escala = e.id_escala) AND (ep.id_funcao = e.id_funcao))))
  WHERE ((ev.data_evento >= date_trunc('week'::text, (CURRENT_DATE)::timestamp with time zone)) AND (ev.data_evento < (date_trunc('week'::text, (CURRENT_DATE)::timestamp with time zone) + '7 days'::interval)))
  GROUP BY e.id_escala, ev.data_evento, e.id_funcao, f.nome, ev.hora_inicio;


--
-- Name: vw_eventos_janela; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_eventos_janela AS
 SELECT e.id_evento,
    e.nome,
    e.data_evento,
    e.hora_inicio,
    e.hora_fim,
    ((e.data_evento + COALESCE(e.hora_inicio, '00:00:00'::time without time zone)) AT TIME ZONE z.fuso) AS inicio_em,
    (((e.data_evento + COALESCE(e.hora_fim, '23:59:00'::time without time zone)) +
        CASE
            WHEN ((e.hora_inicio IS NOT NULL) AND (e.hora_fim IS NOT NULL) AND (e.hora_fim <= e.hora_inicio)) THEN '1 day'::interval
            ELSE '00:00:00'::interval
        END) AT TIME ZONE z.fuso) AS fim_em,
    ((e.data_evento + '23:59:00'::time without time zone) AT TIME ZONE z.fuso) AS limite_diario_em
   FROM (public.eventos e
     CROSS JOIN ( SELECT COALESCE(( SELECT configuracoes_igreja.fuso_horario
                   FROM public.configuracoes_igreja
                  ORDER BY configuracoes_igreja.id
                 LIMIT 1), 'America/Sao_Paulo'::character varying) AS fuso) z);


--
-- Name: vw_resumo_pessoas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_resumo_pessoas AS
 SELECT ( SELECT count(*) AS count
           FROM public.membros
          WHERE ((membros.classificacao)::text = 'visitante'::text)) AS total_visitantes,
    ( SELECT count(*) AS count
           FROM public.membros
          WHERE ((membros.classificacao)::text = 'membro'::text)) AS total_membros,
    ( SELECT count(*) AS count
           FROM public.membros) AS total_pessoas,
    ( SELECT count(*) AS count
           FROM public.membros
          WHERE (((membros.classificacao)::text = 'visitante'::text) AND (date_trunc('month'::text, (membros.data_primeira_visita)::timestamp with time zone) = date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))) AS novos_visitantes_mes;


--
-- Name: vw_voluntarios_disponiveis; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_voluntarios_disponiveis AS
 SELECT id_membro,
    nome_completo,
    ativo,
    apto_voluntario,
    voluntario
   FROM public.membros
  WHERE ((ativo = true) AND (apto_voluntario = true) AND (voluntario = false));


--
-- Name: cadastroturmas id_turma; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadastroturmas ALTER COLUMN id_turma SET DEFAULT nextval('public.cadastroturmas_id_turma_seq'::regclass);


--
-- Name: categorias_financeiras id_categoria; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_financeiras ALTER COLUMN id_categoria SET DEFAULT nextval('public.categorias_financeiras_id_categoria_seq'::regclass);


--
-- Name: configuracoes_igreja id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_igreja ALTER COLUMN id SET DEFAULT nextval('public.configuracoes_igreja_id_seq'::regclass);


--
-- Name: contas id_conta; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas ALTER COLUMN id_conta SET DEFAULT nextval('public.contas_id_conta_seq'::regclass);


--
-- Name: criancas id_crianca; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas ALTER COLUMN id_crianca SET DEFAULT nextval('public.criancas_id_crianca_seq'::regclass);


--
-- Name: departamentos id_departamento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos ALTER COLUMN id_departamento SET DEFAULT nextval('public.departamentos_id_departamento_seq'::regclass);


--
-- Name: documentos_financeiros id_documento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_financeiros ALTER COLUMN id_documento SET DEFAULT nextval('public.documentos_financeiros_id_documento_seq'::regclass);


--
-- Name: escala_trocas id_troca; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_trocas ALTER COLUMN id_troca SET DEFAULT nextval('public.escala_trocas_id_troca_seq'::regclass);


--
-- Name: escalas id_escala; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas ALTER COLUMN id_escala SET DEFAULT nextval('public.escalas_id_escala_seq'::regclass);


--
-- Name: eventos id_evento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos ALTER COLUMN id_evento SET DEFAULT nextval('public.eventos_id_evento_seq'::regclass);


--
-- Name: fornecedores id_fornecedor; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores ALTER COLUMN id_fornecedor SET DEFAULT nextval('public.fornecedores_id_fornecedor_seq'::regclass);


--
-- Name: funcoes id_funcao; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcoes ALTER COLUMN id_funcao SET DEFAULT nextval('public.funcoes_id_funcao_seq'::regclass);


--
-- Name: membros id_membro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membros ALTER COLUMN id_membro SET DEFAULT nextval('public.membros_id_membro_seq'::regclass);


--
-- Name: movimentacoes_financeiras id_movimentacao; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_financeiras ALTER COLUMN id_movimentacao SET DEFAULT nextval('public.movimentacoes_financeiras_id_movimentacao_seq'::regclass);


--
-- Name: notificacoes id_notificacao; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes ALTER COLUMN id_notificacao SET DEFAULT nextval('public.notificacoes_id_notificacao_seq'::regclass);


--
-- Name: push_inscricoes id_inscricao; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_inscricoes ALTER COLUMN id_inscricao SET DEFAULT nextval('public.push_inscricoes_id_inscricao_seq'::regclass);


--
-- Name: relatorios_gerados id_relatorio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relatorios_gerados ALTER COLUMN id_relatorio SET DEFAULT nextval('public.relatorios_gerados_id_relatorio_seq'::regclass);


--
-- Name: responsaveis id_responsavel; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responsaveis ALTER COLUMN id_responsavel SET DEFAULT nextval('public.responsaveis_id_responsavel_seq'::regclass);


--
-- Name: turma_alertas id_alerta; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_alertas ALTER COLUMN id_alerta SET DEFAULT nextval('public.turma_alertas_id_alerta_seq'::regclass);


--
-- Name: turma_atendimentos id_atendimento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_atendimentos ALTER COLUMN id_atendimento SET DEFAULT nextval('public.turma_atendimentos_id_atendimento_seq'::regclass);


--
-- Name: turma_auditoria id_registro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_auditoria ALTER COLUMN id_registro SET DEFAULT nextval('public.turma_auditoria_id_registro_seq'::regclass);


--
-- Name: turma_codigos id_codigo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos ALTER COLUMN id_codigo SET DEFAULT nextval('public.turma_codigos_id_codigo_seq'::regclass);


--
-- Name: turma_sessoes id_sessao; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_sessoes ALTER COLUMN id_sessao SET DEFAULT nextval('public.turma_sessoes_id_sessao_seq'::regclass);


--
-- Name: turmas id_registro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turmas ALTER COLUMN id_registro SET DEFAULT nextval('public.turmas_id_registro_seq'::regclass);


--
-- Name: usuarios id_usuario; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id_usuario SET DEFAULT nextval('public.usuarios_id_usuario_seq'::regclass);


--
-- Name: visitantes id_visitante; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitantes ALTER COLUMN id_visitante SET DEFAULT nextval('public.visitantes_id_visitante_seq'::regclass);


--
-- Name: voluntario_ausencias id_ausencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntario_ausencias ALTER COLUMN id_ausencia SET DEFAULT nextval('public.voluntario_ausencias_id_ausencia_seq'::regclass);


--
-- Name: voluntarios id_voluntario; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntarios ALTER COLUMN id_voluntario SET DEFAULT nextval('public.voluntarios_id_voluntario_seq'::regclass);


--
-- Name: avisos_enviados avisos_enviados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos_enviados
    ADD CONSTRAINT avisos_enviados_pkey PRIMARY KEY (chave);


--
-- Name: cadastroturmas cadastroturmas_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadastroturmas
    ADD CONSTRAINT cadastroturmas_nome_key UNIQUE (nome);


--
-- Name: cadastroturmas cadastroturmas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadastroturmas
    ADD CONSTRAINT cadastroturmas_pkey PRIMARY KEY (id_turma);


--
-- Name: categorias_financeiras categorias_financeiras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_financeiras
    ADD CONSTRAINT categorias_financeiras_pkey PRIMARY KEY (id_categoria);


--
-- Name: configuracoes_igreja configuracoes_igreja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_igreja
    ADD CONSTRAINT configuracoes_igreja_pkey PRIMARY KEY (id);


--
-- Name: contas contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pkey PRIMARY KEY (id_conta);


--
-- Name: crianca_responsavel crianca_responsavel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca_responsavel
    ADD CONSTRAINT crianca_responsavel_pkey PRIMARY KEY (id_crianca, id_responsavel);


--
-- Name: criancas criancas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT criancas_pkey PRIMARY KEY (id_crianca);


--
-- Name: departamentos departamentos_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_nome_key UNIQUE (nome);


--
-- Name: departamentos departamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departamentos
    ADD CONSTRAINT departamentos_pkey PRIMARY KEY (id_departamento);


--
-- Name: documentos_financeiros documentos_financeiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_financeiros
    ADD CONSTRAINT documentos_financeiros_pkey PRIMARY KEY (id_documento);


--
-- Name: escala_participantes escala_participantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_participantes
    ADD CONSTRAINT escala_participantes_pkey PRIMARY KEY (id_escala, id_voluntario, id_funcao);


--
-- Name: escala_trocas escala_trocas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_trocas
    ADD CONSTRAINT escala_trocas_pkey PRIMARY KEY (id_troca);


--
-- Name: escalas escalas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_pkey PRIMARY KEY (id_escala);


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id_evento);


--
-- Name: fornecedores fornecedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_pkey PRIMARY KEY (id_fornecedor);


--
-- Name: funcoes funcoes_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcoes
    ADD CONSTRAINT funcoes_nome_key UNIQUE (nome);


--
-- Name: funcoes funcoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcoes
    ADD CONSTRAINT funcoes_pkey PRIMARY KEY (id_funcao);


--
-- Name: membros membros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membros
    ADD CONSTRAINT membros_pkey PRIMARY KEY (id_membro);


--
-- Name: movimentacoes_financeiras movimentacoes_financeiras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_financeiras
    ADD CONSTRAINT movimentacoes_financeiras_pkey PRIMARY KEY (id_movimentacao);


--
-- Name: notificacoes notificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id_notificacao);


--
-- Name: push_inscricoes push_inscricoes_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_inscricoes
    ADD CONSTRAINT push_inscricoes_endpoint_key UNIQUE (endpoint);


--
-- Name: push_inscricoes push_inscricoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_inscricoes
    ADD CONSTRAINT push_inscricoes_pkey PRIMARY KEY (id_inscricao);


--
-- Name: relatorios_gerados relatorios_gerados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relatorios_gerados
    ADD CONSTRAINT relatorios_gerados_pkey PRIMARY KEY (id_relatorio);


--
-- Name: responsaveis responsaveis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.responsaveis
    ADD CONSTRAINT responsaveis_pkey PRIMARY KEY (id_responsavel);


--
-- Name: turma_alertas turma_alertas_id_sessao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_alertas
    ADD CONSTRAINT turma_alertas_id_sessao_key UNIQUE (id_sessao);


--
-- Name: turma_alertas turma_alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_alertas
    ADD CONSTRAINT turma_alertas_pkey PRIMARY KEY (id_alerta);


--
-- Name: turma_atendimentos turma_atendimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_atendimentos
    ADD CONSTRAINT turma_atendimentos_pkey PRIMARY KEY (id_atendimento);


--
-- Name: turma_auditoria turma_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_auditoria
    ADD CONSTRAINT turma_auditoria_pkey PRIMARY KEY (id_registro);


--
-- Name: turma_codigos turma_codigos_id_sessao_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_id_sessao_codigo_key UNIQUE (id_sessao, codigo);


--
-- Name: turma_codigos turma_codigos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_pkey PRIMARY KEY (id_codigo);


--
-- Name: turma_codigos turma_codigos_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_token_key UNIQUE (token);


--
-- Name: turma_sessoes turma_sessoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_sessoes
    ADD CONSTRAINT turma_sessoes_pkey PRIMARY KEY (id_sessao);


--
-- Name: turma_voluntarios turma_voluntarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_voluntarios
    ADD CONSTRAINT turma_voluntarios_pkey PRIMARY KEY (id_turma, id_voluntario);


--
-- Name: turmas turmas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turmas
    ADD CONSTRAINT turmas_pkey PRIMARY KEY (id_registro);


--
-- Name: turmas uq_turmas_membro_data; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turmas
    ADD CONSTRAINT uq_turmas_membro_data UNIQUE (id_turma, id_membro, data);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id_usuario);


--
-- Name: visitantes visitantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitantes
    ADD CONSTRAINT visitantes_pkey PRIMARY KEY (id_visitante);


--
-- Name: voluntario_ausencias voluntario_ausencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntario_ausencias
    ADD CONSTRAINT voluntario_ausencias_pkey PRIMARY KEY (id_ausencia);


--
-- Name: voluntario_funcoes voluntario_funcoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntario_funcoes
    ADD CONSTRAINT voluntario_funcoes_pkey PRIMARY KEY (id_voluntario, id_funcao);


--
-- Name: voluntarios voluntarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntarios
    ADD CONSTRAINT voluntarios_pkey PRIMARY KEY (id_voluntario);


--
-- Name: idx_atendimentos_sessao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimentos_sessao ON public.turma_atendimentos USING btree (id_sessao);


--
-- Name: idx_ausencias_voluntario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ausencias_voluntario ON public.voluntario_ausencias USING btree (id_voluntario, data_inicio, data_fim);


--
-- Name: idx_escala_participantes_voluntario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escala_participantes_voluntario ON public.escala_participantes USING btree (id_voluntario);


--
-- Name: idx_escala_trocas_entrou; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escala_trocas_entrou ON public.escala_trocas USING btree (id_voluntario_entrou);


--
-- Name: idx_escala_trocas_escala; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escala_trocas_escala ON public.escala_trocas USING btree (id_escala);


--
-- Name: idx_escalas_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalas_data ON public.escalas USING btree (data_escala);


--
-- Name: idx_escalas_id_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalas_id_evento ON public.escalas USING btree (id_evento);


--
-- Name: idx_eventos_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_data ON public.eventos USING btree (data_evento);


--
-- Name: idx_membros_ativo_apto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membros_ativo_apto ON public.membros USING btree (ativo, apto_voluntario);


--
-- Name: idx_membros_classificacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membros_classificacao ON public.membros USING btree (classificacao);


--
-- Name: idx_membros_nascimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membros_nascimento ON public.membros USING btree (data_nascimento);


--
-- Name: idx_notificacoes_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificacoes_usuario ON public.notificacoes USING btree (id_usuario, lida, criado_em DESC);


--
-- Name: idx_push_inscricoes_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_inscricoes_usuario ON public.push_inscricoes USING btree (id_usuario);


--
-- Name: idx_relatorios_gerados_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relatorios_gerados_data ON public.relatorios_gerados USING btree (gerado_em DESC);


--
-- Name: idx_relatorios_gerados_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relatorios_gerados_evento ON public.relatorios_gerados USING btree (id_evento);


--
-- Name: idx_turma_alertas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turma_alertas_status ON public.turma_alertas USING btree (status, criado_em DESC);


--
-- Name: idx_turma_auditoria_sessao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turma_auditoria_sessao ON public.turma_auditoria USING btree (id_sessao, criado_em);


--
-- Name: idx_turmas_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_turmas_data ON public.turmas USING btree (data);


--
-- Name: uq_atendimento_presente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_atendimento_presente ON public.turma_atendimentos USING btree (id_sessao, id_crianca) WHERE (saida_em IS NULL);


--
-- Name: uq_codigo_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_codigo_ativo ON public.turma_codigos USING btree (id_atendimento) WHERE ((status)::text = 'ativo'::text);


--
-- Name: uq_codigo_retirada_sessao; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_codigo_retirada_sessao ON public.turma_codigos USING btree (id_sessao, codigo_retirada);


--
-- Name: uq_criancas_id_membro; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_criancas_id_membro ON public.criancas USING btree (id_membro);


--
-- Name: uq_token_crianca; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_token_crianca ON public.turma_codigos USING btree (token_crianca);


--
-- Name: uq_turma_sessao_aberta; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_turma_sessao_aberta ON public.turma_sessoes USING btree (id_turma) WHERE ((status)::text = 'aberta'::text);


--
-- Name: uq_turma_sessao_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_turma_sessao_evento ON public.turma_sessoes USING btree (id_turma, id_evento);


--
-- Name: uq_usuarios_id_membro; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_usuarios_id_membro ON public.usuarios USING btree (id_membro) WHERE (id_membro IS NOT NULL);


--
-- Name: uq_visitantes_id_membro; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_visitantes_id_membro ON public.visitantes USING btree (id_membro) WHERE (id_membro IS NOT NULL);


--
-- Name: cadastroturmas cadastroturmas_id_membro_responsavel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cadastroturmas
    ADD CONSTRAINT cadastroturmas_id_membro_responsavel_fkey FOREIGN KEY (id_membro_responsavel) REFERENCES public.membros(id_membro);


--
-- Name: crianca_responsavel crianca_responsavel_autorizacao_atualizada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca_responsavel
    ADD CONSTRAINT crianca_responsavel_autorizacao_atualizada_por_fkey FOREIGN KEY (autorizacao_atualizada_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: criancas criancas_id_membro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT criancas_id_membro_fkey FOREIGN KEY (id_membro) REFERENCES public.membros(id_membro);


--
-- Name: criancas criancas_id_turma_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criancas
    ADD CONSTRAINT criancas_id_turma_fkey FOREIGN KEY (id_turma) REFERENCES public.cadastroturmas(id_turma);


--
-- Name: escala_trocas escala_trocas_id_escala_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_trocas
    ADD CONSTRAINT escala_trocas_id_escala_fkey FOREIGN KEY (id_escala) REFERENCES public.escalas(id_escala) ON DELETE CASCADE;


--
-- Name: escala_trocas escala_trocas_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_trocas
    ADD CONSTRAINT escala_trocas_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: escala_trocas escala_trocas_id_voluntario_entrou_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_trocas
    ADD CONSTRAINT escala_trocas_id_voluntario_entrou_fkey FOREIGN KEY (id_voluntario_entrou) REFERENCES public.voluntarios(id_voluntario) ON DELETE CASCADE;


--
-- Name: escala_trocas escala_trocas_id_voluntario_saiu_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_trocas
    ADD CONSTRAINT escala_trocas_id_voluntario_saiu_fkey FOREIGN KEY (id_voluntario_saiu) REFERENCES public.voluntarios(id_voluntario) ON DELETE CASCADE;


--
-- Name: escalas escalas_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.eventos(id_evento);


--
-- Name: escalas escalas_id_funcao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_id_funcao_fkey FOREIGN KEY (id_funcao) REFERENCES public.funcoes(id_funcao);


--
-- Name: contas fk_conta_categoria; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT fk_conta_categoria FOREIGN KEY (id_categoria) REFERENCES public.categorias_financeiras(id_categoria);


--
-- Name: contas fk_conta_fornecedor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT fk_conta_fornecedor FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedores(id_fornecedor);


--
-- Name: crianca_responsavel fk_cr_crianca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca_responsavel
    ADD CONSTRAINT fk_cr_crianca FOREIGN KEY (id_crianca) REFERENCES public.criancas(id_crianca);


--
-- Name: crianca_responsavel fk_cr_responsavel; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crianca_responsavel
    ADD CONSTRAINT fk_cr_responsavel FOREIGN KEY (id_responsavel) REFERENCES public.responsaveis(id_responsavel);


--
-- Name: documentos_financeiros fk_doc_conta; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_financeiros
    ADD CONSTRAINT fk_doc_conta FOREIGN KEY (id_conta) REFERENCES public.contas(id_conta);


--
-- Name: documentos_financeiros fk_doc_movimentacao; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_financeiros
    ADD CONSTRAINT fk_doc_movimentacao FOREIGN KEY (id_movimentacao) REFERENCES public.movimentacoes_financeiras(id_movimentacao);


--
-- Name: escala_participantes fk_ep_escala; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_participantes
    ADD CONSTRAINT fk_ep_escala FOREIGN KEY (id_escala) REFERENCES public.escalas(id_escala) ON DELETE CASCADE;


--
-- Name: escala_participantes fk_ep_funcao; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_participantes
    ADD CONSTRAINT fk_ep_funcao FOREIGN KEY (id_funcao) REFERENCES public.funcoes(id_funcao);


--
-- Name: escala_participantes fk_ep_voluntario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_participantes
    ADD CONSTRAINT fk_ep_voluntario FOREIGN KEY (id_voluntario) REFERENCES public.voluntarios(id_voluntario);


--
-- Name: escalas fk_escalas_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT fk_escalas_evento FOREIGN KEY (id_evento) REFERENCES public.eventos(id_evento) ON DELETE CASCADE;


--
-- Name: movimentacoes_financeiras fk_mov_categoria; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_financeiras
    ADD CONSTRAINT fk_mov_categoria FOREIGN KEY (id_categoria) REFERENCES public.categorias_financeiras(id_categoria);


--
-- Name: movimentacoes_financeiras fk_mov_conta; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_financeiras
    ADD CONSTRAINT fk_mov_conta FOREIGN KEY (id_conta) REFERENCES public.contas(id_conta);


--
-- Name: voluntario_funcoes fk_vf_funcao; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntario_funcoes
    ADD CONSTRAINT fk_vf_funcao FOREIGN KEY (id_funcao) REFERENCES public.funcoes(id_funcao);


--
-- Name: voluntario_funcoes fk_vf_voluntario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntario_funcoes
    ADD CONSTRAINT fk_vf_voluntario FOREIGN KEY (id_voluntario) REFERENCES public.voluntarios(id_voluntario);


--
-- Name: voluntarios fk_voluntario_departamento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntarios
    ADD CONSTRAINT fk_voluntario_departamento FOREIGN KEY (id_departamento) REFERENCES public.departamentos(id_departamento);


--
-- Name: voluntarios fk_voluntario_membro; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntarios
    ADD CONSTRAINT fk_voluntario_membro FOREIGN KEY (id_membro) REFERENCES public.membros(id_membro);


--
-- Name: notificacoes notificacoes_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE;


--
-- Name: push_inscricoes push_inscricoes_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_inscricoes
    ADD CONSTRAINT push_inscricoes_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE;


--
-- Name: relatorios_gerados relatorios_gerados_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relatorios_gerados
    ADD CONSTRAINT relatorios_gerados_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.eventos(id_evento) ON DELETE SET NULL;


--
-- Name: relatorios_gerados relatorios_gerados_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relatorios_gerados
    ADD CONSTRAINT relatorios_gerados_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario);


--
-- Name: turma_alertas turma_alertas_id_sessao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_alertas
    ADD CONSTRAINT turma_alertas_id_sessao_fkey FOREIGN KEY (id_sessao) REFERENCES public.turma_sessoes(id_sessao) ON DELETE RESTRICT;


--
-- Name: turma_alertas turma_alertas_tratado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_alertas
    ADD CONSTRAINT turma_alertas_tratado_por_fkey FOREIGN KEY (tratado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: turma_atendimentos turma_atendimentos_entrada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_atendimentos
    ADD CONSTRAINT turma_atendimentos_entrada_por_fkey FOREIGN KEY (entrada_por) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;


--
-- Name: turma_atendimentos turma_atendimentos_id_crianca_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_atendimentos
    ADD CONSTRAINT turma_atendimentos_id_crianca_fkey FOREIGN KEY (id_crianca) REFERENCES public.criancas(id_crianca) ON DELETE RESTRICT;


--
-- Name: turma_atendimentos turma_atendimentos_id_responsavel_retirada_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_atendimentos
    ADD CONSTRAINT turma_atendimentos_id_responsavel_retirada_fkey FOREIGN KEY (id_responsavel_retirada) REFERENCES public.responsaveis(id_responsavel) ON DELETE SET NULL;


--
-- Name: turma_atendimentos turma_atendimentos_id_sessao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_atendimentos
    ADD CONSTRAINT turma_atendimentos_id_sessao_fkey FOREIGN KEY (id_sessao) REFERENCES public.turma_sessoes(id_sessao) ON DELETE RESTRICT;


--
-- Name: turma_atendimentos turma_atendimentos_saida_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_atendimentos
    ADD CONSTRAINT turma_atendimentos_saida_por_fkey FOREIGN KEY (saida_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: turma_auditoria turma_auditoria_id_atendimento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_auditoria
    ADD CONSTRAINT turma_auditoria_id_atendimento_fkey FOREIGN KEY (id_atendimento) REFERENCES public.turma_atendimentos(id_atendimento) ON DELETE RESTRICT;


--
-- Name: turma_auditoria turma_auditoria_id_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_auditoria
    ADD CONSTRAINT turma_auditoria_id_codigo_fkey FOREIGN KEY (id_codigo) REFERENCES public.turma_codigos(id_codigo) ON DELETE RESTRICT;


--
-- Name: turma_auditoria turma_auditoria_id_sessao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_auditoria
    ADD CONSTRAINT turma_auditoria_id_sessao_fkey FOREIGN KEY (id_sessao) REFERENCES public.turma_sessoes(id_sessao) ON DELETE RESTRICT;


--
-- Name: turma_auditoria turma_auditoria_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_auditoria
    ADD CONSTRAINT turma_auditoria_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: turma_codigos turma_codigos_emitido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_emitido_por_fkey FOREIGN KEY (emitido_por) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;


--
-- Name: turma_codigos turma_codigos_id_atendimento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_id_atendimento_fkey FOREIGN KEY (id_atendimento) REFERENCES public.turma_atendimentos(id_atendimento) ON DELETE RESTRICT;


--
-- Name: turma_codigos turma_codigos_id_responsavel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_id_responsavel_fkey FOREIGN KEY (id_responsavel) REFERENCES public.responsaveis(id_responsavel) ON DELETE SET NULL;


--
-- Name: turma_codigos turma_codigos_id_sessao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_id_sessao_fkey FOREIGN KEY (id_sessao) REFERENCES public.turma_sessoes(id_sessao) ON DELETE RESTRICT;


--
-- Name: turma_codigos turma_codigos_invalidado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_invalidado_por_fkey FOREIGN KEY (invalidado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: turma_codigos turma_codigos_segunda_via_de_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_segunda_via_de_fkey FOREIGN KEY (segunda_via_de) REFERENCES public.turma_codigos(id_codigo);


--
-- Name: turma_codigos turma_codigos_utilizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_codigos
    ADD CONSTRAINT turma_codigos_utilizado_por_fkey FOREIGN KEY (utilizado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: turma_sessoes turma_sessoes_aberta_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_sessoes
    ADD CONSTRAINT turma_sessoes_aberta_por_fkey FOREIGN KEY (aberta_por) REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT;


--
-- Name: turma_sessoes turma_sessoes_encerrada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_sessoes
    ADD CONSTRAINT turma_sessoes_encerrada_por_fkey FOREIGN KEY (encerrada_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: turma_sessoes turma_sessoes_id_evento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_sessoes
    ADD CONSTRAINT turma_sessoes_id_evento_fkey FOREIGN KEY (id_evento) REFERENCES public.eventos(id_evento) ON DELETE RESTRICT;


--
-- Name: turma_sessoes turma_sessoes_id_turma_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_sessoes
    ADD CONSTRAINT turma_sessoes_id_turma_fkey FOREIGN KEY (id_turma) REFERENCES public.cadastroturmas(id_turma) ON DELETE RESTRICT;


--
-- Name: turma_voluntarios turma_voluntarios_id_turma_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_voluntarios
    ADD CONSTRAINT turma_voluntarios_id_turma_fkey FOREIGN KEY (id_turma) REFERENCES public.cadastroturmas(id_turma) ON DELETE CASCADE;


--
-- Name: turma_voluntarios turma_voluntarios_id_voluntario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_voluntarios
    ADD CONSTRAINT turma_voluntarios_id_voluntario_fkey FOREIGN KEY (id_voluntario) REFERENCES public.voluntarios(id_voluntario) ON DELETE CASCADE;


--
-- Name: turma_voluntarios turma_voluntarios_vinculado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turma_voluntarios
    ADD CONSTRAINT turma_voluntarios_vinculado_por_fkey FOREIGN KEY (vinculado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: turmas turmas_id_membro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turmas
    ADD CONSTRAINT turmas_id_membro_fkey FOREIGN KEY (id_membro) REFERENCES public.membros(id_membro);


--
-- Name: turmas turmas_id_turma_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turmas
    ADD CONSTRAINT turmas_id_turma_fkey FOREIGN KEY (id_turma) REFERENCES public.cadastroturmas(id_turma);


--
-- Name: usuarios usuarios_id_membro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_id_membro_fkey FOREIGN KEY (id_membro) REFERENCES public.membros(id_membro);


--
-- Name: visitantes visitantes_id_membro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitantes
    ADD CONSTRAINT visitantes_id_membro_fkey FOREIGN KEY (id_membro) REFERENCES public.membros(id_membro);


--
-- Name: voluntario_ausencias voluntario_ausencias_id_voluntario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voluntario_ausencias
    ADD CONSTRAINT voluntario_ausencias_id_voluntario_fkey FOREIGN KEY (id_voluntario) REFERENCES public.voluntarios(id_voluntario) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

-- =========================================================
-- Dados iniciais de uma instalação nova (entram no instalacao.sql)
-- Só as listas básicas que o sistema usa desde o primeiro dia.
-- Nenhuma pessoa, login, evento, escala ou lançamento financeiro.
-- Tudo pode ser alterado depois pelas telas do sistema.
-- =========================================================

-- Dados da igreja (Configurações)
INSERT INTO public.configuracoes_igreja (id, nome_igreja, cnpj, telefone, endereco, cidade, estado, horario_principal, fuso_horario, notificacoes, notificacoes_email)
VALUES (1, 'Igreja Novo Caminho', '65.202.907/0001-89', '(47) 98479-5832',
        'R. Mal. Rondon, 932 - Alto das Palmeiras, Canoinhas - SC, 89462-048',
        'Canoinhas', 'Santa Catarina', '08:00', 'America/Sao_Paulo', TRUE, TRUE);
SELECT setval('public.configuracoes_igreja_id_seq', 1);

-- Departamentos dos voluntários
INSERT INTO public.departamentos (nome, descricao, ativo) VALUES
    ('Recepção', 'Departamento responsável pela recepção', TRUE),
    ('Louvor', 'Departamento de música e louvor', TRUE),
    ('Kids', 'Departamento responsável pelas crianças', TRUE),
    ('Mídia', 'Departamento de comunicação e mídia', TRUE),
    ('Estacionamento', 'Organização do estacionamento', TRUE),
    ('Integração', 'Integração de visitantes e membros', TRUE);

-- Funções das escalas (qtd_voluntarios = por escala; vagas = tamanho desejado da equipe)
INSERT INTO public.funcoes (nome, descricao, ativo, qtd_voluntarios, vagas, dias_disponiveis) VALUES
    ('ESTACIONAMENTO', 'Responsável pelo estacionamento', TRUE, 1, 6, '{domingo,sexta,sabado}'),
    ('RECEPÇÃO', 'Responsável pela recepção', TRUE, 4, 18, '{domingo,quarta,sexta,sabado}'),
    ('FOTOS', 'Responsável pelos registros fotográficos', TRUE, 1, 4, '{domingo,sexta,sabado}'),
    ('PROJEÇÃO', 'Responsável pela projeção', TRUE, 1, 7, '{domingo,quarta,sabado}'),
    ('MESA DE SOM', 'Responsável pela mesa de som', TRUE, 1, 6, '{domingo,quarta,sexta,sabado}'),
    ('KIDS (2 A 4 ANOS)', 'Responsável pelas crianças de 2 a 4 anos', TRUE, 2, 5, '{domingo,sabado}'),
    ('KIDS (5 A 8 ANOS)', 'Responsável pelas crianças de 5 a 8 anos', TRUE, 1, 8, '{domingo,sabado}'),
    ('LÍDER PEDAGÓGICO', 'Responsável pela liderança pedagógica', TRUE, 1, 6, '{domingo,sabado}'),
    ('NEXT', 'Responsável pelo NEXT', TRUE, 1, 4, '{domingo,sabado}'),
    ('LOUVOR', 'Responsável pelo louvor', TRUE, 6, 17, '{domingo,quarta,sexta,sabado}'),
    ('GESTÃO DE CULTO', 'Responsável pela gestão do culto', TRUE, 2, 9, '{domingo,sexta,sabado}');

-- Turmas da lista de presença e das crianças (o responsável é escolhido depois, em Crianças → Gerenciar turmas)
INSERT INTO public.cadastroturmas (nome, idade_minima, idade_maxima, dia_semana, horario, ativo) VALUES
    ('Kids — 2 a 4 anos', 2, 4, 'Domingo', '09:00', TRUE),
    ('Kids — 5 a 8 anos', 5, 8, 'Domingo', '09:00', TRUE),
    ('Next', 9, 12, 'Domingo', '09:00', TRUE),
    ('Adolescentes — 13 a 17 anos', 13, 17, 'Domingo', '09:00', TRUE);

-- Categorias do financeiro
INSERT INTO public.categorias_financeiras (nome, tipo, ativo) VALUES
    ('Dízimos', 'RECEITA', TRUE),
    ('Ofertas', 'RECEITA', TRUE),
    ('Doações', 'RECEITA', TRUE),
    ('Eventos', 'RECEITA', TRUE),
    ('Energia Elétrica', 'DESPESA', TRUE),
    ('Água', 'DESPESA', TRUE),
    ('Manutenção', 'DESPESA', TRUE),
    ('Material de Limpeza', 'DESPESA', TRUE),
    ('Material Administrativo', 'DESPESA', TRUE),
    ('Serviços', 'DESPESA', TRUE),
    ('Despesas com Eventos', 'DESPESA', TRUE),
    ('Ação Social', 'DESPESA', TRUE),
    ('Missões', 'DESPESA', TRUE),
    ('Pessoal', 'DESPESA', TRUE);
