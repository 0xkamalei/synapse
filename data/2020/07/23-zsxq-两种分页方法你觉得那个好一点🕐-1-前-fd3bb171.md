---
id: "fd3bb171a6269351"
hash_id: "fd3bb171a626935186178cc80100698c12cca78d328417b9648382778d54a1e8"
source: "ZSXQ"
type: "text"
title: "两种分页方法你觉得那个好一点🕐\n1 前..."
url: "https://wx.zsxq.com/group/48415284844818#:~:text=%E4%B8%A4%E7%A7%8D%E5%88%86%E9%A1%B5%E6%96%B9%E6%B3%95%E4%BD%A0%E8%A7%89%E5%BE%97%E9%82%A3%E4%B8%AA%E5%A5%BD%E4%B8%80%E7%82%B9%F0%9F%95%90-1-%E5%89%8D%E7%AB%AF%E6%8E%A7%E5%88%B6%E6%AF%8F%E9%A1%B5%E4%B8%AA%E6%95%B0-%E8%AF%B7%E6%B1%82pageNo-pageSize-%E8%BF%94%E5%9B%9E%EF%BC%9A"
original_date: "2020-07-23T03:29:00.000+00:00"
collected_at: "2026-01-16T06:22:00.000Z"
status: "collected"
server_version: "1"
---

两种分页方法你觉得那个好一点🕐
1 前端控制每页个数
请求pageNo pageSize 
返回：data:[],count:int
2 请求 固定返回个数 后端绝对
请求：prev:int ,aid:int 业务id
返回 data:[], page:{count:int,more:boolean}
