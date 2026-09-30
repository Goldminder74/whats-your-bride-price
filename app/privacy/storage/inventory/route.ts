import { storageInventory, STORAGE_NOTICE_VERSION } from "../../../storageInventory.ts";
export function GET(){return Response.json({noticeVersion:STORAGE_NOTICE_VERSION,generatedFrom:"app/storageInventory.ts",entries:storageInventory},{headers:{"cache-control":"public, max-age=300","x-content-type-options":"nosniff"}})}
