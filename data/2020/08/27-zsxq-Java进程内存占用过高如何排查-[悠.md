---
id: "7f5c83f7f2564069"
hash_id: "7f5c83f7f25640698cc8c915d5ee04883ee3a4b6a4565cfeeb536ff289e09d4f"
source: "ZSXQ"
type: "text"
title: "Java进程内存占用过高如何排查？\n[悠..."
url: "https://wx.zsxq.com/group/48415284844818#:~:text=Java%E8%BF%9B%E7%A8%8B%E5%86%85%E5%AD%98%E5%8D%A0%E7%94%A8%E8%BF%87%E9%AB%98%E5%A6%82%E4%BD%95%E6%8E%92%E6%9F%A5-%E6%83%85%E5%86%B51-%E7%BA%BF%E4%B8%8A%E7%8E%AF%E5%A2%83%E5%86%85%E5%AD%98%E6%BA%A2%E5%87%BA-%E8%83%BD%E9%87%8D%E5%90%AF%E5%8A%A0%E5%90%AF%E5%8A%A8%E5%8F%82%E6%95%B0-XX"
original_date: "2020-08-27T08:39:00.000+00:00"
collected_at: "2026-01-16T06:32:00.000Z"
status: "collected"
server_version: "1"
---

Java进程内存占用过高如何排查？
[悠闲]情况1  线上环境内存溢出 ，能重启加启动参数
-XX:+HeapDumpOnOutOfMemoryError 
-XX:HeapDumpPath=/tmp/heapdump.hprof
溢出后拿到hrof文件 

[抠鼻]情况2不能重启  1 查看内存占用jmap -heap [PID]，2 查看对象数量 jmap -histo [PID] ，3 导出 jmap -F -dump:live,file=jmap.hprof [PID]  

通过MAT分析hprof文件
👻关键：选中占用高的对象后右击选择with incomming reference 查看引用对象
配合jstat，jstack分析占用来源
