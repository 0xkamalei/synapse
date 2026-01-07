## collector 的设计逻辑
0. 如果用户没有配置当前平台的target user id 则跳过
1. isTargetURL 先判断当前页面是否是target页面 根据用户配置精确匹配URL 
2. 判断 internal time 是否满足
2. 获取页面element
3. 解析content内容
4. 发送到background保存