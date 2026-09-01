# Gestor Local de Condomínios

Aplicação web local para gestão simples de condomínios. Funciona diretamente no navegador, guarda os dados no dispositivo e pode ser instalada como PWA.

## Funcionalidades

- gestão de vários condomínios e frações;
- registo de condóminos e permilagens;
- geração e acompanhamento de quotas;
- recibos e avisos de pagamento para impressão;
- registo de despesas e documentos;
- reconciliação de movimentos bancários;
- pesquisa global e relatórios em CSV;
- importação de JSON, ZIP, CSV e XLSX;
- cópias de segurança manuais e automáticas;
- cofre opcional com cifragem AES-GCM no navegador;
- funcionamento offline através de Service Worker.

## Executar

Não existem dependências para instalar. Serve a pasta através de HTTP:

```bash
python3 -m http.server 8080
```

Depois abre `http://localhost:8080`.

## Armazenamento e privacidade

Os dados são guardados no `localStorage` do navegador e não são enviados para um servidor. Limpar os dados do navegador pode apagar a informação, por isso devem ser criadas cópias de segurança com regularidade.

O cofre local reduz a exposição dos dados armazenados no dispositivo, mas não transforma a aplicação num sistema multiutilizador nem substitui controlos de segurança de um backend.

## Limitações

- não existe sincronização entre dispositivos;
- não há contas de utilizador ou controlo de acessos no servidor;
- a aplicação depende do armazenamento disponível no navegador;
- deve ser tratada como solução local e protótipo académico.

