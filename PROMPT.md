# Projeto: Livro de Receitas — PC e celular, cada um com seus dados, sincronizando em casa

Você vai evoluir comigo o Livro de Receitas que já existe neste repositório: um livro de receitas pessoal
(só eu uso), com visual de livro antigo de capa dura, páginas que viram, receitas digitadas ou escritas com
caneta, foto do prato e cadeado com senha e digital. Hoje ele roda no meu PC e o celular só abre pelo
Tailscale, dependendo do PC ligado. O que eu quero:
1. **Sem Tailscale e sem nada na internet.**
2. **Cada aparelho com os próprios dados:** receita que eu faço no PC fica no PC; a que faço no celular
   (Android, app instalado) fica no celular, mesmo sem internet e longe de casa.
3. **Quando os dois estiverem na mesma rede Wi-Fi, eles se sincronizam** e ficam com os mesmos dados.
   Se a mesma receita foi mudada nos dois, vale a edição mais recente.
4. No celular, achar receita por **busca e categoria**.

## O que já existe (evoluir, não reescrever)
- `server/app.py`: FastAPI, API em /api, fotos em /media, serve o site; middleware tranca /api e /media.
- `server/store.py`: receitas em data/recipes.parquet (DuckDB), fotos e manuscritos em data/media/.
- `server/auth.py`: senha (PBKDF2), digital (passkey/WebAuthn), sessão, freio contra tentativas.
- `web/`: index.html com <template>s, módulos JS sem bundler (api, book, editor, ink, lock, pages, main),
  CSS com todas as cores em tokens.css, manifest.webmanifest e sw.js.
- `server/test_core.py`: teste com assert, sem framework. `iniciar.bat` abre o livro com dois cliques.
- `data/` fica fora do git. Backup = copiar data/ do PC.

## Como trabalhar comigo
- Construa em etapas, na ordem abaixo. Ao fim de cada uma, rode as verificações dela, me mostre o resultado
  e espere meu ok antes de seguir.
- Antes de cada etapa, diga em poucas linhas o que vai fazer e o que está assumindo. Se houver mais de um
  jeito razoável, pergunte.
- Código simples: nada de abstração para um uso só, nada "para depois", dependência nova (Python ou JS) só
  quando poucas linhas não resolvem. Sem bundler nem framework no front.
- Comentários em português explicando o porquê, não o quê. Código em inglês; textos da tela em português.
  Siga o estilo dos arquivos que já existem.
- Preserve o visual e o que já funciona: virada de página, arrastar a folha, caneta, cadeado, digital.
  Toda cor nova sai de tokens.css.
- Nunca perca receita: qualquer mudança no formato de data/ migra o arquivo atual sozinha, e antes de
  testar a migração com meus dados você faz uma cópia de data/.
- Nunca commite data/, .env, tokens, certificados ou backup. Variável nova entra num .env.example explicada.
- Tudo que eu tiver que fazer fora do código (cadastro, roteador, firewall, celular) vem em passos
  numerados, com o clique ou o comando exato.

## Como fica (arquitetura)
- **PC:** o servidor de hoje continua sendo o livro do PC (parquet + data/media/). O navegador do PC usa o
  servidor como hoje, com senha.
- **Celular:** o app instalado guarda as receitas, fotos e manuscritos no próprio aparelho (IndexedDB, com
  navigator.storage.persist()) e funciona inteiro sem o PC: ler, criar, editar, apagar, foto e caneta.
  O mesmo front serve os dois: celular pareado usa o armazenamento local; o resto usa o servidor.
- **Sincronização:** só celular ⇄ PC, pela rede de casa. Cada receita ganha `updated_at` e apagar vira
  marca de apagada (`deleted`), para a exclusão também viajar. Os dois lados trocam a lista
  {id, updated_at, deleted} de todas as receitas (são poucas), e para cada id vale a mais recente, junto com
  as fotos e manuscritos dela. Sincronização interrompida no meio não perde nem duplica nada: a próxima
  completa. Roda sozinha ao abrir o app e ao voltar para ele, e também pelo botão "Sincronizar", com
  "sincronizado há X min" à vista.
- **HTTPS em casa (sem comprar nada):** o celular só instala o app, guarda dados e usa digital em HTTPS.
  Um nome grátis do DuckDNS (ex.: livro-xyz.duckdns.org) aponta para o IP do PC **dentro** da rede de casa;
  o Caddy no Windows tira o certificado pelo desafio DNS do DuckDNS e repassa para o uvicorn. Nada fica
  acessível de fora de casa. O `iniciar.bat` atualiza o IP no DuckDNS a cada início (o IP do PC pode mudar).

## Segurança
- PC: tudo continua atrás do cadeado (/api e /media só destrancado). O servidor escuta na rede de casa só
  pelo Caddy (porta 443, firewall do Windows liberado só para rede Privada); uvicorn em 127.0.0.1.
- Pareamento do celular: uma vez, com a senha do livro, o PC entrega ao celular um token de aparelho (no
  servidor fica só o hash). A sincronização usa esse token; dá para desparear pelo PC (`server/auth.py`).
- Celular: abre com a digital (WebAuthn conferida no próprio aparelho, que funciona sem o PC). É proteção
  contra quem pega o celular desbloqueado, não contra quem tem o aparelho e ferramentas; deixe isso num
  comentário. "Trancar" fecha o livro mas não apaga os dados nem o pareamento.
- A digital (rp_id e origem aceita) sai do nome configurado (variável), nunca dos cabeçalhos
  Host/X-Forwarded-Host da requisição.
- CSP com default-src 'self': o livro não carrega nada de fora. As fontes do Google passam a ser servidas
  pelo próprio app (web/fonts/), o que também é preciso para funcionar sem internet.
- Token do DuckDNS só no .env do PC.

## Etapas

### 1. Base sem Tailscale
Tirar o Tailscale de iniciar.bat e do README; fontes servidas pelo app; nome do livro e da digital por
variável de ambiente; CSP e cabeçalhos básicos.
Pronto quando: os testes passam (com caso novo: rp_id vem da configuração mesmo com Host forjado); o livro
abre em localhost:8000 igual a hoje e a aba Rede não mostra nenhuma requisição para fora.

### 2. HTTPS na rede de casa
DuckDNS (cadastro e token), Caddy para Windows com o módulo do DuckDNS (Caddyfile no repo, executável fora
do git), iniciar.bat atualizando o IP e subindo Caddy + uvicorn, regra do firewall do Windows, e um
passo a passo em docs/CASA.md. Se o roteador bloquear nome público apontando para IP de casa (proteção
contra "DNS rebinding"), a saída no Android é DNS privado = dns.google; deixe isso no passo a passo.
Pronto quando: com o celular no Wi-Fi de casa, https://<nome>.duckdns.org abre com cadeado de site seguro,
destranca com senha, ativa a digital e instala como app com o ícone certo; o certificado se renova sozinho.

### 3. Receitas prontas para sincronizar (servidor)
store.py ganha `updated_at` e `deleted` (o arquivo atual migra sozinho; receitas antigas ganham a data de
agora); apagar vira marca de apagada e remove as fotos; listas e sumário ignoram as apagadas. Pareamento com
token de aparelho e os endpoints da sincronização (trocar a lista, enviar e receber receitas e mídias).
Pronto quando: testes com assert cobrem: migração de um parquet antigo sem perder receita; para o mesmo id
vence o updated_at maior; apagada no celular apaga no PC e vice-versa; token errado ou despareado dá 401.

### 4. Celular independente
Armazenamento local (IndexedDB) com as mesmas operações que o api.js já expõe, escolhido quando o aparelho
está pareado; service worker guardando a casca do app (HTML, CSS, JS, fontes, ícones) com cache versionado
e os antigos apagados na ativação; abrir com a digital sem o PC; tela de "Parear com o PC".
Pronto quando: no celular instalado e pareado, em modo avião, fechar e reabrir: abre com a digital, mostra
as receitas e fotos, e dá para criar, editar (com foto e caneta) e apagar; uma versão nova do app substitui
a antiga na próxima vez que o celular estiver em casa.

### 5. Sincronizar
Automático ao abrir e ao voltar para o app, botão "Sincronizar", aviso discreto do resultado
("3 receitas atualizadas") e "sincronizado há X min". Sem o PC à vista, falha em silêncio.
Pronto quando, num teste de verdade: com o celular fora do Wi-Fi, crio uma receita no PC e outra no
celular, edito uma existente em cada lado, apago uma no celular e mudo a mesma receita nos dois (por último
no celular). De volta ao Wi-Fi, os dois ficam iguais (mesmas receitas, textos, fotos e manuscritos), a
apagada some dos dois e a receita mudada nos dois fica com a versão do celular. Desligar o Wi-Fi no meio da
sincronização e sincronizar de novo termina sem duplicar nada.

### 6. Busca e categorias
Lupa na barra do livro que abre uma folha (no estilo do editor) com campo de busca e chips das categorias;
resultado em lista com título, categoria e miniatura; tocar abre a receita no livro. Busca no navegador,
sobre a lista já carregada, ignorando acentos e maiúsculas, em título, categoria e ingredientes. Pergunte
antes se o sumário também deve ser agrupado por categoria.
Pronto quando: "fuba" acha "Bolo de Fubá"; o filtro por categoria funciona; funciona em 375 px e no
desktop, no PC e no celular sem internet; dá para usar só pelo teclado (Esc fecha, Enter abre o primeiro).

## Fora do escopo (de propósito)
Acesso ao PC de fora de casa (longe de casa o celular usa a própria cópia), servidor na internet, outras
pessoas e contas, Next.js/Postgres, assistente de IA, bots de Telegram e WhatsApp, planos e cobrança,
tutorial de primeiro acesso, página pública e SEO.

## Para começar
Antes de escrever código, me devolva: (1) o desenho da sincronização: o que muda em cada lado, o que viaja
na rede, a regra de conflito e o que acontece com receitas apagadas, fotos e manuscritos; (2) o passo a
passo do HTTPS em casa e o que eu preciso baixar ou cadastrar; (3) como o arquivo atual de receitas migra
sem perder nada. Espere eu aprovar.
