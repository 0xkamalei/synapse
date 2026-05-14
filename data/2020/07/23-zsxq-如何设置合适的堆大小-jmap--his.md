---
id: "c17f70b5f049a022"
hash_id: "c17f70b5f049a02212fc1b6a9759c0ecb7fedd3ed0e841a2995925cdb184f7ca"
source: "ZSXQ"
type: "text"
title: "如何设置合适的堆大小\njmap -his..."
url: "https://wx.zsxq.com/group/48415284844818#:~:text=%E5%A6%82%E4%BD%95%E8%AE%BE%E7%BD%AE%E5%90%88%E9%80%82%E7%9A%84%E5%A0%86%E5%A4%A7%E5%B0%8F-jmap-histo-live-pid-%E6%89%8B%E5%8A%A8%E8%A7%A6%E5%8F%91full-GC-%E5%A0%86"
original_date: "2020-07-23T03:27:00.000+00:00"
collected_at: "2026-01-16T06:32:00.000Z"
status: "collected"
server_version: "1"
---

如何设置合适的堆大小
jmap -histo:live < pid > 手动触发full GC 
堆大小=fullGC存货size * 1.5~2倍
