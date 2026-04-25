# Storage Upload Policy

Este documento registra a politica base de storage privado do projeto.
Ele cobre buckets fundacionais, MIME, tamanho e prefixo de path.

## Regras gerais

- bucket sensivel nasce privado
- acesso em bucket privado depende de RLS em `storage.objects`
- download em bucket privado deve usar JWT do usuario ou signed URL temporaria
- path sempre comeca em `tenant/<tenant_uuid>/...`
- arquivos sensiveis nao entram em bucket publico
- remocao de objeto deve acontecer pela Storage API, nunca por `delete` SQL direto

## Buckets fundacionais

| Bucket | Uso | Publico | Limite | MIME permitido | Prefixo exigido |
| --- | --- | --- | --- | --- | --- |
| `brand-assets` | logo e ativos de configuracao do tenant | nao | 5 MB | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` | `tenant/<tenant_uuid>/branding/...` |
| `profile-avatars` | avatar de equipe e perfil autenticado | nao | 5 MB | `image/png`, `image/jpeg`, `image/webp` | `tenant/<tenant_uuid>/profiles/<profile_uuid>/...` |
| `patient-documents` | PDFs, anexos, comprovantes, previews e pacotes documentais do paciente | nao | 20 MB | `application/pdf`, `application/zip`, `application/x-zip-compressed`, `image/png`, `image/jpeg`, `image/webp`, `text/html` | `tenant/<tenant_uuid>/patients/<patient_uuid>/documents/...` |
| `clinical-attachments` | anexos vinculados a encounter e atendimento | nao | 20 MB | `application/pdf`, `image/png`, `image/jpeg`, `image/webp` | `tenant/<tenant_uuid>/patients/<patient_uuid>/encounters/<encounter_uuid>/...` |

## Politica de acesso

### Leitura

- `brand-assets`: `settings.read`, `settings.write`, `platform.read` ou gestao de tenant
- `profile-avatars`: proprio perfil ou gestao de usuarios/configuracoes
- `patient-documents`: acesso ao paciente + permissao de documentos/clinical
- `clinical-attachments`: acesso ao paciente + permissao de documentos/clinical

### Escrita, update e delete

- `brand-assets`: somente gestao de tenant/configuracoes
- `profile-avatars`: proprio perfil ou gestao de usuarios/configuracoes
- `patient-documents`: permissao de `documents.write`, `clinical.write` ou `patients.write`
- `clinical-attachments`: permissao de `documents.write` ou `clinical.write`

## Regras de naming

- usar nomes estaveis e ASCII quando possivel
- evitar espacos desnecessarios e caracteres exoticos no nome final
- manter o arquivo dentro do prefixo de dominio; nao reutilizar o bucket para outro fluxo

## Regras operacionais

- qualquer bucket novo precisa entrar aqui e em migration versionada
- se o produto precisar de novo MIME ou tamanho maior, a mudanca deve acontecer primeiro em migration
- buckets documentais de etapas futuras podem nascer depois, mas devem seguir o mesmo padrao: privado + prefixo por tenant + RLS ligada ao dominio
- `text/html` em `patient-documents` esta liberado para previews versionados do fluxo `document-printable`; `pdf` usa `application/pdf` e `print_package` usa ZIP com HTML, PDF e manifesto
- o detalhe do encounter ja usa signed URLs temporarias para abrir e baixar artefatos de `patient-documents`; qualquer nova superficie documental deve reaproveitar expiracao curta e nunca expor path privado diretamente ao browser
