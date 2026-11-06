# Distribuição institucional do Lume Navegador

A primeira versão institucional prevista é **2.4.2 (2008)**, com o pacote `br.gov.ro.lume.lume_navegador` e a Central `https://sos-mulher.incubadora.cloud`. O QR do piloto oferece o APK de avaliação 2.4.1 (2007) até a aprovação da versão assinada pela instituição.

## Conta e titularidade

Na conta existente do Google Play Console, abra **Android developer verification → Register packages** para registrar o APK que será distribuído pelo QR. O Play Console pode aproveitar a identidade já verificada e registrar pacotes distribuídos fora da loja. Esse caminho dispensa abrir outra conta e pagar uma inscrição no Android Developer Console. [Registro pelo Play Console](https://developer.android.com/developer-verification/guides/google-play-console), [perguntas frequentes do Google](https://developer.android.com/developer-verification/guides/faq#identity_and_accounts)

Confirme o titular da conta e a pessoa jurídica responsável pelo Projeto Cidades Inteligentes antes de vincular o pacote. Se a conta existente for pessoal, o representante autorizado confirma se essa titularidade foi aprovada ou se a instituição deve usar sua própria conta. Se a instituição precisar abrir uma conta independente para distribuição fora da loja, escolha **Organization** e **Full distribution** no Android Developer Console. O representante conclui diretamente no console o login, a verificação de identidade e contatos, a aceitação dos termos e eventual pagamento. Prepare os documentos da organização, o D‑U‑N‑S e o site verificado no Search Console conforme o formulário. [Requisitos de distribuição ampla](https://developer.android.com/developer-verification/guides/full-distribution)

## Chave de assinatura

O custodiante usa a chave institucional já designada para este pacote ou cria a primeira em uma pasta privada fora do repositório. Defina `LUME_SIGNING_DIR` com o caminho absoluto dessa pasta. Execute no computador de assinatura com o `keytool` da JDK usada pelo Flutter. O comando `flutter doctor -v` mostra o caminho do Java. Digite a senha nos prompts.

```sh
: "${LUME_SIGNING_DIR:?Defina o diretório privado de assinatura}"
umask 077
mkdir -p "$LUME_SIGNING_DIR"
keytool -genkeypair -storetype PKCS12 -alias lume -keyalg RSA -keysize 3072 \
  -validity 10000 -keystore "$LUME_SIGNING_DIR/lume-release.p12"
keytool -list -v -storetype PKCS12 -alias lume \
  -keystore "$LUME_SIGNING_DIR/lume-release.p12"
keytool -exportcert -rfc -storetype PKCS12 -alias lume \
  -keystore "$LUME_SIGNING_DIR/lume-release.p12" \
  -file "$LUME_SIGNING_DIR/lume-release-cert.pem"
```

Guarde o `.p12` e seu backup cifrado sob custódia institucional e a senha no cofre da instituição. A equipe de implantação recebe o certificado público e o APK, com os respectivos SHA-256. A chave privada e a senha ficam fora do chat, dos argumentos de comando, do Git e do servidor que entrega o APK. As próximas versões usam a mesma chave e um código de versão maior. [Guia de assinatura Android](https://developer.android.com/studio/publish/app-signing)

## Registro do pacote

Em **Register packages**, informe `br.gov.ro.lume.lume_navegador` e o **SHA-256 do certificado** exibido pelo `keytool`. Cadastre apenas o certificado institucional. Se o console pedir prova de posse, coloque o trecho recebido em `apps/mobile/android/app/src/main/assets/adi-registration.properties` somente numa cópia isolada do projeto. Gere e assine esse APK com a chave institucional e envie o arquivo de prova ao console. O APK para distribuição sai de uma cópia limpa, sem o trecho. Se o console pedir justificativa por já conhecer o pacote com outra chave, encaminhe a solicitação com a chave institucional. [Registro de pacotes](https://developer.android.com/developer-verification/guides/google-play-console), [arquivo de prova](https://developer.android.com/developer-verification/reference/developer-console-api)

## Geração e verificação do release

Execute da raiz do repositório em Zsh, com o rastreamento de comandos desativado. O exemplo usa a mesma senha para o arquivo PKCS12 e a chave. A compilação recebe as credenciais por variáveis de ambiente dentro da subsessão.

```zsh
node scripts/prepare-voice-model.mjs
(
  set +x
  export LUME_KEYSTORE_PATH="$LUME_SIGNING_DIR/lume-release.p12"
  export LUME_KEY_ALIAS=lume
  read -rs 'LUME_KEYSTORE_PASSWORD?Senha do PKCS12: ' || exit 1
  printf '\n'
  export LUME_KEYSTORE_PASSWORD
  export LUME_KEY_PASSWORD="$LUME_KEYSTORE_PASSWORD"
  export GRADLE_OPTS='-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false -Dorg.gradle.caching=false'
  cd apps/mobile || exit 1
  flutter build apk --release --build-name=2.4.2 --build-number=2008 \
    --dart-define=API_BASE_URL=https://sos-mulher.incubadora.cloud
)
```

Use `apksigner` e `aapt` do Android SDK Build Tools para inspecionar o artefato.

```sh
lume_apk=apps/mobile/build/app/outputs/flutter-apk/app-release.apk
apksigner verify --verbose --print-certs "$lume_apk"
aapt dump badging "$lume_apk"
aapt dump xmltree "$lume_apk" AndroidManifest.xml
unzip -Z1 "$lume_apk"
shasum -a 256 "$lume_apk"
```

Confirme um único signatário com o SHA-256 do certificado cadastrado, o pacote, a versão 2.4.2 (2008) e as arquiteturas `arm64-v8a`, `armeabi-v7a` e `x86_64`. O manifesto deve manter `debuggable` e `testOnly` ausentes ou falsos e `usesCleartextTraffic=false`. Confira a inclusão do modelo offline e a ausência do arquivo `adi-registration.properties`. Registre o commit usado e o SHA-256 do APK. [Verificação com `apksigner`](https://developer.android.com/tools/apksigner)

## Teste no Samsung e promoção do QR

1. Confirme **Registered** no console para o pacote e o certificado institucional. Disponibilize o APK validado em um endereço HTTPS de teste com acesso restrito e leia seu QR com a câmera do Samsung. Confirme download, instalação, abertura e vínculo com cadastro fictício. Verifique a entrega de um **teste simulado** à Central, encerre a ocorrência e confira o encerramento no aparelho.
2. Nos aparelhos com o APK debug do piloto, o Android rejeita a atualização direta porque o certificado mudou. Combine a janela de troca com a equipe. Encerre ocorrências e sincronize a fila antes de desinstalar o APK debug, instalar o release e refazer vínculo, permissões e treino. A reinstalação remove os dados locais do app.
3. Com o registro e o teste confirmados, publique os mesmos bytes por troca atômica de `lume-navegador.apk` na pasta de publicação. O QR mantém `https://sos-mulher.incubadora.cloud/downloads/lume-navegador.apk`. Confira o `Content-Type`, o SHA-256 do download público e a instalação a partir do QR da Central. Registre o responsável pela assinatura, o estado no console, o resultado no Samsung e o hash publicado. [Publicação no servidor](deployment.md#publicação-do-apk-para-o-qr-da-central)

Para o teste, a Central aceita `/downloads/teste/<token>/lume-navegador.apk`. Gere um token aleatório de 32 dígitos hexadecimais (por exemplo, `openssl rand -hex 16`), coloque somente o APK validado em `$APK_DOWNLOAD_DIR/teste/<token>/lume-navegador.apk` e compartilhe o endereço exclusivamente com a pessoa que fará o teste. O endereço dá acesso a quem o possuir; retire o arquivo ao concluir o teste. Esse caminho é separado do QR emitido para as assistidas.

### Diagnóstico de instalação pelo QR

- **“Não foi possível verificar o desenvolvedor de apps”**: compare o certificado do arquivo baixado com a chave **Verificada** do pacote no Play Console. Verifique se o aparelho está online, se o sistema do Google Play está atualizado e se há uma instalação anterior do mesmo pacote. **“O app não foi instalado”** é uma mensagem genérica e, sozinha, não identifica a causa. [Estados do instalador Android](https://developer.android.com/reference/android/content/pm/PackageInstaller#EXTRA_DEVELOPER_VERIFICATION_FAILURE_REASON)
- **Play Protect**: se o aviso identificar acesso sensível, teste um APK que não declare o serviço de Acessibilidade usado pelo atalho de volume. No comando de release, prefixe `flutter build apk` com `LUME_QR_RELEASE=true` e use um código de versão novo. Confirme no manifesto final que `BIND_ACCESSIBILITY_SERVICE` está ausente e que a assinatura institucional foi preservada. O botão flutuante e a palavra-chave permanecem disponíveis; o atalho de volume fica indisponível nesta edição. [Orientação do Play Protect](https://developers.google.com/android/play-protect/warning-dev-guidance?hl=pt-BR)
- **Bloqueador automático da Samsung**: a configuração pode impedir instalação fora das lojas aprovadas mesmo com uma assinatura válida. Uma instalação via ADB serve para testar o app, mas não comprova instalação pela câmera ou pelo navegador. [Bloqueador automático da Samsung](https://www.samsung.com/br/support/mobile-devices/proteja-seu-dispositivo-galaxy-com-a-nova-funcao-auto-blocker/)
