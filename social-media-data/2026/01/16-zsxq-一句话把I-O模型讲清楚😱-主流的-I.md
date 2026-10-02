---
id: "46cdebd9793a2760"
hash_id: "46cdebd9793a2760bd0f38c97418efef836c18c79e89175b57f17ec2910579b3"
source: "ZSXQ"
type: "text"
title: "一句话把I/O模型讲清楚😱\n主流的 I..."
url: "https://wx.zsxq.com/group/48415284844818#:~:text=%E4%B8%80%E5%8F%A5%E8%AF%9D%E6%8A%8AI-O%E6%A8%A1%E5%9E%8B%E8%AE%B2%E6%B8%85%E6%A5%9A-%E4%B8%BB%E6%B5%81%E7%9A%84-I-O-%E6%A8%A1%E5%9E%8B%E9%80%9A%E5%B8%B8%E6%9C%89-5-%E7%A7%8D%E7%B1%BB%E5%9E%8B-%E9%98%BB%E5%A1%9E%E5%BC%8F-I-O-%E9%9D%9E%E9%98%BB%E5%A1%9E%E5%BC%8F-I"
original_date: "2026-01-16T06:32:00.000+00:00"
collected_at: "2026-01-16T06:33:00.000Z"
status: "collected"
server_version: "1"
---

一句话把I/O模型讲清楚😱
主流的 I/O 模型通常有 5 种类型：阻塞式 I/O、非阻塞式 I/O、I/O 多路复用、信号驱动 I/O 和异步 I/O。每种 I/O 模型都有各自典型的使用场景，比如 Java 中 Socket 对象的阻塞模式和非阻塞模式就对应于前两种模型；而 Linux 中的系统调用 select 函数就属于 I/O 多路复用模型；大名鼎鼎的 epoll 系统调用则介于第三种和第四种模型之间；至于第五种模型，其实很少有 Linux 系统支持，反而是 Windows 系统提供了一个叫 IOCP 线程模型属于这一种。
