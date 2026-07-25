---
'@pith-cms/next': patch
---

The editor sidebar Preview button now becomes "Exit preview" while a preview session is active. The preview banner no longer shows an Exit control; instead it polls the server every 3 seconds and refreshes on focus so the banner disappears automatically when the preview is disabled from another tab. View controls remain aligned to the same height. The consumer playground preview banner closes the preview tab and returns focus to the editor tab.
