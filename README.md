# CDXED — Portfólio de Michel Rezini

Site de portfólio para editor de vídeo, com painel administrativo protegido
por login real (Firebase Authentication) em `/admCDX`. Sem frameworks, sem
build — só HTML, CSS e JavaScript puro (ES Modules), lendo e gravando dados
no Firebase que você já tinha configurado (`cdxed-c2d54`).

```
cdxed/
├── index.html          → site público
├── admin.html           → painel administrativo (fica em /admCDX)
├── admin.js              (na verdade em js/admin.js — veja abaixo)
├── css/
│   ├── base.css         → cores, tipografia, componentes compartilhados
│   ├── style.css        → estilos do site público
│   └── admin.css        → estilos do painel
├── js/
│   ├── firebase-config.js → inicializa o Firebase (o config que você me deu)
│   ├── icons.js            → ícones SVG usados em todo o site
│   ├── link-utils.js        → transforma um link de vídeo (YouTube/Vimeo/etc.) em player embutido + capa padrão
│   ├── main.js              → lógica do site público
│   └── admin.js              → lógica do painel administrativo
├── assets/               → favicon em vários tamanhos (gerado a partir da sua logo)
├── firestore.rules       → regras de segurança do banco (leia a seção abaixo!)
├── firebase.json          → configuração de hospedagem (inclui a rota /admCDX)
├── .firebaserc
└── _redirects              → só se você hospedar na Netlify em vez do Firebase
```

---

## 1. Por que isso é seguro (leia antes de tudo)

Você pediu para a senha do painel (`c0d3x2017`) não ficar exposta no
frontend. Sendo direto: **qualquer verificação de senha feita só em
JavaScript no navegador pode ser lida por quem inspecionar o código** —
mesmo que a senha esteja "criptografada" (um hash), dá para copiar esse
hash e tentar quebrá-lo offline, ou simplesmente ignorar a tela de login e
chamar o banco de dados diretamente.

Por isso, em vez de simular uma senha no frontend, o painel usa o
**Firebase Authentication** de verdade:

- Quando você digita a senha em `/admCDX`, ela vai direto para os
  servidores do Firebase (`signInWithEmailAndPassword`). O `admin.js` nunca
  guarda, compara ou vê essa senha — só recebe a resposta "certo" ou
  "errado".
- Quem decide se pode **gravar** dados não é o formulário de login, é a
  **regra do Firestore** (`firestore.rules`), que exige `request.auth != null`
  — ou seja, só grava quem passou pelo login de verdade.
- A leitura (o que o cliente vê no site) continua pública, porque o site
  precisa mostrar seus projetos para qualquer visitante sem senha nenhuma.

Isso é estritamente mais seguro do que qualquer senha "escondida" no
JavaScript, e também resolve o outro pedido: hoje suas regras estão como
`allow read, write: if true`, ou seja, **qualquer pessoa na internet pode
apagar ou alterar seus dados agora mesmo**, mesmo sem entrar no painel. O
arquivo `firestore.rules` deste projeto corrige isso.

---

**Sobre o Firebase Storage**: este projeto não usa. Foto de perfil, selo do
certificado e vídeo/capa dos projetos são todos **links** que você cola no
painel (ex: um link do YouTube, uma imagem hospedada em algum lugar), em vez
de arquivos enviados para o Storage. Desde fevereiro de 2026 o Google exige
que o projeto esteja no plano Blaze (pay-as-you-go) para usar o Storage,
mesmo sem custo real de uso — então tirar essa dependência evita precisar
cadastrar cartão de crédito no projeto.

---

## 2. Configuração no Firebase (fazer uma vez só)

### 2.1 Ativar login por e-mail/senha
1. Abra o [Firebase Console](https://console.firebase.google.com/) → projeto `cdxed-c2d54`.
2. Vá em **Authentication → Sign-in method** → ative **Email/senha**.
3. Vá em **Authentication → Users → Add user** e crie o usuário admin:
   - E-mail: `c0d3xed@gmail.com` (já está assim em `js/admin.js`, na constante `ADMIN_EMAIL` — pode trocar por outro e-mail se preferir, só ajuste os dois lugares)
   - Senha: pode usar `c0d3x2017` como pediu, mas **eu recomendo algo mais forte** (mín. 10-12 caracteres, com números e símbolos), já que é a única barreira de verdade agora. Você pode trocar essa senha quando quiser, direto no Firebase Console, sem tocar em nenhum arquivo do site.

### 2.2 Publicar a regra de segurança
1. **Firestore Database → Regras** → apague o conteúdo atual → cole o conteúdo de `firestore.rules` → **Publicar**.

### 2.3 (Se for hospedar no Firebase Hosting — recomendado)
Com [Node.js](https://nodejs.org) instalado:
```bash
npm install -g firebase-tools
firebase login
cd cdxed              # pasta deste projeto
firebase deploy
```
O `firebase.json` já está configurado com a regra que faz `/admCDX` abrir
`admin.html` mantendo o endereço `/admCDX` na barra do navegador — exatamente
como você pediu. Ao final, o Firebase te dá uma URL tipo
`https://cdxed-c2d54.web.app`.

Se preferir não usar linha de comando, dá pra arrastar a pasta em
**Hosting → Adicionar outro site** no console — nesse caso me avisa que te
mostro o passo a passo alternativo.

---

## 3. Como usar o painel no dia a dia

1. Acesse `https://seu-dominio/admCDX`.
2. Digite a senha cadastrada no passo 2.1.
3. Três abas:
   - **Perfil** — link da foto, nome, cargo, descrição, localização, data de
     nascimento (a idade no site é **calculada automaticamente** a partir
     dela, sempre atualizada), formação atual, status de disponibilidade e
     a lista de ferramentas/conhecimentos (com barra de nível).
   - **Certificados** — clique em "Novo certificado": nome, o que ele
     ensina, descrição, data de início/conclusão (deixe conclusão em
     branco para aparecer "em andamento") e, se quiser, o **link** de uma
     imagem do selo ou de um PDF do certificado (o site detecta sozinho e
     mostra um botão "abrir" em vez de tentar exibir o PDF como imagem).
   - **Projetos** — clique em "Novo projeto": título, cliente, descrição,
     data em que o pedido chegou, data de entrega, o **link do vídeo**
     (YouTube, Vimeo ou qualquer outro link) e uma capa opcional.

     Não tem mais upload de arquivo — você só cola o link do vídeo (ex:
     `https://youtube.com/watch?v=...`) e o site já embute o player
     automaticamente na página. Se não colar uma capa, o site usa a
     miniatura padrão do próprio vídeo (do YouTube, isso é instantâneo; do
     Vimeo, busca automaticamente; de outras plataformas, mostra um botão
     "assistir vídeo" que abre o link).
4. Clique em **Salvar** — a mudança aparece no site público na hora
   (sem precisar reimplantar nada).
5. **Sair** desconecta o login com segurança.

---

## 4. Modelo de dados (Firestore)

| Coleção/Documento     | Campos principais |
|---|---|
| `config/profile` (documento único) | `name, role, bio, location, birthdate, education, available, availableText, photoURL, skills: [{name, level}]` |
| `certificates/{id}` | `title, teaches, description, startDate, endDate, badgeURL` |
| `projects/{id}` | `title, client, description, videoLink, dateReceived, dateDelivered, coverURL` |

Você não precisa mexer nisso manualmente — é só o que o painel grava. Documentando aqui só para referência caso queira consultar direto no Firebase Console.

---

## 5. Personalização rápida

- **Cores**: tudo em `css/base.css`, no bloco `:root` (procure por `--blue`, `--void`, etc.).
- **Fontes**: já configuradas conforme pedido (Fredoka / Space Grotesk / Inter), carregadas via Google Fonts no `<head>` de `index.html` e `admin.html`.
- **Textos fixos** (parágrafo de contato, headline da seção de projetos, etc.): estão direto no `index.html`, em português, prontos para editar se quiser ajustar o tom.
- **E-mail e Discord de contato**: aparecem em `index.html` (busque por `c0d3xed@gmail.com` e `c0d3xx`).

---

## 6. Coisas que valem a pena verificar antes de divulgar o link

- [ ] Usuário admin criado no Firebase Authentication
- [ ] `firestore.rules` publicado (não deixe a regra padrão `allow read, write: if true`)
- [ ] Login testado em `/admCDX` com a senha definitiva
- [ ] Pelo menos 1 projeto e 1 certificado cadastrados, para a home não ficar com os estados vazios
#   C D X E D  
 