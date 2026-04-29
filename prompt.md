Implementation plan
                                                                                                                                                                              
  Phase 0 — Mongo schema + zod                                                                                                                                                
                                                                                                                                                                              
  - New model src/backend/db/models/template.model.ts: name, category, status ('draft' | 'published'), fieldConfig, normalized, designJson, coverImage: { url, publicId,      
  width, height } | null, designAssets: Map<nodeId, { url, publicId, mime, width?, height? }>, createdBy (ref User), publishedAt, timestamps, version (optimistic
  concurrency).                                                                                                                                                               
  - Index: { status: 1, publishedAt: -1 } for the gallery list.
                                                                                                                                                                              
  Phase 1 — Cloudinary upload helpers
                                                                                                                                                                              
  - src/backend/cloudinary/upload.ts: uploadImage(buffer, folder, publicId?), deleteAsset(publicId), deleteFolder(folder). upload_stream for buffers.                         
  - Folder layout: fyb-studio/templates/{templateId}/cover, fyb-studio/templates/{templateId}/assets/{nodeId}.
                                                                                                                                                                              
  Phase 2 — Template service                                                                                                                                                  
                                                                                                                                                                              
  - src/backend/services/template.service.ts: createDraft, updatePublished, publish, unpublishAndDelete, listPublished, getById, listAdminAll.                                
  - Every mutating call emits a templates:changed event on a shared in-process EventEmitter (used by SSE in Phase 5).
                                                                                                                                                                              
  Phase 3 — Admin REST APIs (server-only)                                                                                                                                     
                                                                                                                                                                              
  - POST /api/admin/templates — first publish or save draft (multipart: JSON meta + cover + asset files).                                                                     
  - PATCH /api/admin/templates/[id] — update; cover optional (skip = leave unchanged).
  - DELETE /api/admin/templates/[id] — full purge (Mongo doc + Cloudinary cover + all asset publicIds + folder).                                                              
  - Gated by admin session (you already have ADMIN_EMAILS).                                                                                                                   
                                                                                                                                                                              
  Phase 4 — Public read APIs                                                                                                                                                  
                                                                                                                                                                              
  - GET /api/templates — list published (lean projection: id, name, category, coverImageUrl, updatedAt).                                                                      
  - GET /api/templates/[id] — full record (designJson + normalized + fieldConfig + asset URL map).
                                                                                                                                                                              
  Phase 5 — SSE channel                                                                                                                                                       
                                                                                                                                                                              
  - GET /api/templates/stream — Edge-compatible SSE. Subscribes to the in-process emitter, sends { type: 'changed' } per event.                                               
  - Note for prod scaling: in-process EventEmitter only works in a single Node instance. If you ever run multiple replicas, swap to Mongo change streams or Redis pub/sub.
  Fine for current setup; I'll add a one-line comment so future-you doesn't get bitten.                                                                                       
                  
  Phase 6 — Admin editor rewrite (src/app/admin/templates/[id]/page.tsx + /page.tsx)                                                                                          
                  
  - Replace all createLocalTemplateRepository() calls with backend fetches.                                                                                                   
  - Buttons in the editor toolbar:
    - status === "draft" → Publish (cover required modal).                                                                                                                    
    - status === "published" → Update (optional-cover modal: "Replace cover" or "Skip — keep current") and Unpublish (calls DELETE, full purge with confirm dialog).          
  - The admin templates list page reads from the backend list API.                                                                                                            
                                                                                                                                                                              
  Phase 7 — User gallery (src/app/templates/page.tsx)                                                                                                                         
                  
  - Reads from GET /api/templates on mount.                                                                                                                                   
  - Opens SSE connection; on changed event, re-fetches list and merges quietly — no spinner, no flicker, no skeletons. Updates that don't actually change visible content
  cause no React re-render churn (use stable keys + shallow diff).                                                                                                            
                  
  Phase 8 — User design IDB rework                                                                                                                                            
                  
  - New module src/lib/storage/userDesignRepo.ts. Stores: id (nanoid), templateId, designJson, normalized, fieldConfig, assetUrlsByNodeId, userInputs: { text, color,         
  imageBlobsByNodeId }, createdAt, expiresAt = createdAt + 24h, downloaded: boolean, lastDownloadedAt.
  - One in-progress entry per (userId, templateId) (see Q2 below).                                                                                                            
  - /templates/[id]/use page hydrates its working copy from userDesignRepo (fetching from backend on first open).                                                             
  - On app load (top of RootLayout client wrapper), sweep entries where expiresAt < now and purge them + revoke any blob URLs.                                                
                                                                                                                                                                              
  Phase 9 — Dashboard "Recent downloads"                                                                                                                                      
                                                                                                                                                                              
  - New component on src/app/dashboard/page.tsx that reads from userDesignRepo (client-only, since IDB).                                                                      
  - Shows entries with downloaded === true && expiresAt > now. Each card: thumbnail (last-rendered PNG cached as blob), template name, "expires in Xh", Edit button (→
  /templates/{templateId}/use?userDesignId=...) and Delete button.                                                                                                            
  - Header notice: "Your recent designs are kept on this device for 24 hours, then cleared."
                                                                                                                                                                              
  Phase 10 — Editor "Update" silent-update guard                                                                                                                              
                                                                                                                                                                              
  - When user has the /templates/[id]/use page open and SSE fires for that template, we do not swap the master under them. They keep editing their snapshot. Only the gallery 
  list refreshes. 
                                                                                                                                                                