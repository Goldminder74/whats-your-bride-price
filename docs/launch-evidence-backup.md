# Private evidence preservation — upload pending

5 October 2026 update. The Google Drive connector is now connected and verified as **ayo.m.ayeni@gmail.com**. All four files below were uploaded to My Drive (root; no folder-creation capability was used), then metadata readback verified `shared=false` and exactly the intended owner permission. They are uploaded and owner-only, **not yet checksum-verified cloud backups**. Raw connector fetches succeeded but their authenticated materialisation URLs returned HTTP 403 on local download, including a fresh retry. No download URL or credential is preserved in documentation. OneDrive remains unavailable/unverified.

| Uploaded file | Google Drive file ID |
|---|---|
| launch-evidence-a42ea07f.zip | `1oad_ELFUbe_5uK3vJpfvGgMf9893tc0L` |
| launch-evidence-a42ea07f.zip.sha256 | `1BcNqbCSyyqXIKDgSyVIlWQVrDmun2VCi` |
| launch-evidence-recovery-20261005.zip | `1RA_P9XT323L6IJ7KP7idGzs4C6k-22fv` |
| launch-evidence-recovery-20261005.zip.sha256 | `1ys5Gq_1NNvJ66ewjlW8gk_-OydhLFhJ3` |

Private upload receipt is local ignored `outputs/activation-preparation/google-drive-upload-receipt.json`. Original local archives are unchanged. For Google Drive, **do not upload duplicates**: locate these exact files/IDs, download directly while signed into the owner account, and perform steps 4–5 below. Steps 1–3 remain the manual instructions for the still-missing OneDrive copy and any future organisation into a private folder.

## Exact manual steps

1. In a browser, open Google Drive directly and verify avatar account **ayo.m.ayeni@gmail.com**. My Drive → New → Folder: `WYBP private launch evidence 2026-10-05`. Set folder/file General access **Restricted**, no other users or public links. Do not buy storage; stop if quota is insufficient.
2. New → File upload: select these FOUR files from local `outputs/activation-preparation/`: `launch-evidence-a42ea07f.zip`, `launch-evidence-a42ea07f.zip.sha256`, `launch-evidence-recovery-20261005.zip`, `launch-evidence-recovery-20261005.zip.sha256`. Preserve filenames; never replace original archive with the supplement. Save folder/file IDs privately.
3. Open OneDrive directly, verify avatar **ayofella@yahoo.com**, create the same private folder, Upload → Files: the same four files. Manage access must show only owner; no sharing link. Stop if quota requires spending. This cloud copy must be uploaded to that account, not merely copied into an unverified local sync directory.
4. Download all four files FROM EACH provider into separate fresh local folders (e.g. `$env:TEMP/wybp-gdrive-readback` and `$env:TEMP/wybp-onedrive-readback`). Verify both ZIP hashes against the trusted local values below AND ensure downloaded sidecars match the local sidecars. A successful upload/progress tick alone is insufficient.

```powershell
Get-FileHash -Algorithm SHA256 <downloaded-original.zip>
Get-FileHash -Algorithm SHA256 <downloaded-supplement.zip>
```

Original ZIP SHA-256: `767030e3e12e017bcd13d5de1ab5f7ebd5726727c78bb3d24f2176718e6ac41a`.
Supplement ZIP SHA-256: `40352a9d6b96fc0976441fc4ecd4afb54338b33eb9c4ac4fa1ff878f73a71b61`.

5. Extract each downloaded original to a fresh directory and verify per-file hashes/unlisted files from the repository:

```powershell
node --input-type=module -e "import {verifyArchiveDirectory} from './scripts/archive-launch-evidence.mjs'; await verifyArchiveDirectory(process.argv[1]);" <extracted-original-directory>
```

The supplement `checksums.json` records each body's bytes/hash; verify every extracted file against it too. An exact trusted whole-ZIP hash already proves the downloaded container matches the locally payload-verified original/supplement. Do not edit either downloaded archive. Record provider account, private file ID, date, whole-ZIP and payload results outside Git. Only then mark that provider copy verified.

## Preservation boundaries

GitHub preserves source, original research inputs, structured records/builder, policy and publication manifest; raw/current source bodies and ZIPs are ignored local artefacts. Original archive remains unchanged and documents 119 captures/22 gaps; the separate supplement adds 13 useful current captures, one NASA error body and eight failed requests. Together nine gaps affect 13 proposed questions; see [reconciliation](launch-source-capture-reconciliation.md). No capture is represented as historical raw evidence or human cultural approval. Independent/historical backup remains unverified until actual readback.
