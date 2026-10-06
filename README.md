# Baixar XML de NFe

Extensão Chrome/Edge Manifest V3 para localizar chaves na página aberta, selecionar as notas e abrir a consulta oficial da NF-e.

## Instalação
1. Acesse `chrome://extensions` (ou `edge://extensions`).
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha esta pasta.

## Uso
1. Deixe aberta a página que contém a lista de chaves e clique no ícone da extensão.
2. Clique em **Buscar notas e dados na página aberta**. A extensão procura as chaves e passa sobre cada uma para ler do tooltip a razão social do emitente e o valor total da nota.
3. Confira a lista, desmarque as notas que não deseja e clique em **Consultar selecionadas**.
4. Na página oficial, confira a chave e resolva o hCaptcha manualmente. Quando o portal validar o check, a extensão clica em **Continuar** e, na página seguinte, em **Download do documento**.
5. Confirme o **OK** do aviso do portal. Ao concluir o download, a extensão fecha a aba da consulta; o arquivo permanece na pasta de downloads do navegador.

Para ler os tooltips automaticamente, a extensão usa a permissão de depuração apenas na aba ativa do portal da NF-e enquanto captura a lista, simulando o movimento do ponteiro e se desconectando ao terminar. O portal exige interação humana com o hCaptcha; a extensão não resolve nem marca o desafio. Ela só continua depois que o portal informar que o check manual foi validado. O portal pode exigir certificado digital para o download. As chaves não são enviadas a terceiros e a lista fica armazenada localmente no navegador. O portal pode alterar os campos e parâmetros de consulta.
