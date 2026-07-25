---
'@pith-cms/core': patch
---

Collections now support an optional `order` field that sorts entries. When set, `getEntries` automatically sorts results by the specified field, with numeric comparison for numbers and lexicographic comparison for strings.
