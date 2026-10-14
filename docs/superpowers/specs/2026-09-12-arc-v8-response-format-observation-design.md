# Arc v8 本地响应格式观察设计

2026-09-12，用户已明确批准本地设计；实施计划已写，Task1按TDD启动。第十五次许可已消耗，没有第十六次、Repair、重试或生产发布许可。

## 问题与证据边界

第十五次用户终端ExitCode1，安全Summary记录HTTP200、1100字节、303534ms、reader正常结束、外层JSON解析失败；费用未知。结果尚未进入Provider结果、候选或课程质量校验。源码追踪没有发现本地截断；六个注入fetch的合成案例显示空白、HTML、SSE和残缺JSON会得到同一现有诊断，合法JSON错误对象则不会。合成输入不是实际正文重放，不能据此认定上游返回了其中任何一种。

本设计只减少未来同类失败的格式信息缺口，不修复或宣称找到这次根因，不以更高额度、timeout或放宽解析替代证据。当前真实响应不追溯读取或重建。

## 方案比较

1. **建议：本地失败诊断增加两项固定分类。** 从适配器已经接收到的响应头与已经解码的文本中分类；不保存正文或任意header值，不增加请求。代价是仍不能获得服务商内部错误原因，需要后续实际证据。
2. 只等待现有Activity或客服提供最终状态。无需代码变化，可帮助确认远端是否完成及花费，但可能仍无法解释本地收到的非JSON响应。
3. 改为SSE或拆分为持久后台执行。属于线上长任务设计，影响协议、断线恢复与计费边界，不能仅凭本次1100字节认定它会修复问题；单独设计和验收。

## 范围与数据流

新增小型纯分类模块，供现有可选传输观察器使用。只在显式本地Kimi profile且传输观察器存在、UTF-8已正常flush并且原来的JSON.parse抛错之后调用。不得新增或替换JSON.parse，不修改待解析文本，不提取JSON片段，不解析SSE，不尝试repair。

现有传输诊断保留v1/v2兼容；本地观察改为v3，沿用v2的1320000ms计时边界和全部现有字段/跨字段约束，新增responseFormat字段。v1/v2输出形状与验证规则保持现状。v3在outer-json/invalid-json以外的失败中responseFormat必须为null；在该失败处可以是下面的严格对象，观察自身异常时为null。成功与语义拒绝仍不产生传输诊断。

responseFormat对象恰好含contentType和bodyPrefixKind两个字段；没有正文、长度以外的新计数、片段、散列、动态键、解析器message/stack或请求标识。

| 字段 | 固定枚举与定义 |
| --- | --- |
| contentType | missing、json、html、sse、text、other、unavailable。只读取Content-Type；null为missing；读取异常为unavailable；字符串超过512字符为other。其他值取分号前部分、仅去除两侧HTTP空白U+0009/U+0020并按ASCII转小写；application/json或语法合法的application子类型以+json结尾归json，text/html归html，text/event-stream归sse，text/plain归text，其余other。该声明不保证实际正文符合格式。 |
| bodyPrefixKind | decoded-empty、ascii-whitespace-only、html-like、sse-like、json-container-like、other。分类顺序按下段定义；仅是解码后前缀分类，不证明HTML/SSE或JSON完整合法。 |

文本分类顺序：原解码字符串长度为0则decoded-empty；否则只跳过JSON允许的ASCII空白U+0009/U+000A/U+000D/U+0020，全部跳完则ascii-whitespace-only。随后只检查最多64个UTF-16代码单元的前缀：ASCII不区分大小写的<!doctype html（后接ASCII空白或>）或<html（后接ASCII空白或>）为html-like；区分大小写的data:、event:、id:、retry:或冒号开头为sse-like；首字符为{或[为json-container-like；其余other。按html、sse、json、other顺序决策。

上段HTML前缀后的ASCII空白明确仅为U+0009/U+000A/U+000D/U+0020；垂直制表符和换页符不属于本分类的空白。沿用现有fatal TextDecoder的BOM行为，不另行删除BOM或Unicode空白。decoded-empty可能来自BOM-only字节，不等同receivedBytes0；非ASCII空白归other。以上分类不引用Content-Type推断正文，两项可以互相矛盾并按事实保留。json-container-like不等于确定截断，sse-like不等于服务端启用了stream。

分类不新增reader、fetch、计时器、原始文本副本或正则回溯式大字符串扫描；允许对已有有界文本做一次ASCII空白扫描和64字符前缀取样，前缀只存在于调用内，不进入观察对象、日志或磁盘。Content-Type规范化同样只存在于调用内。

## 投影、安全与行为保持

v3严格投影检查完整固定顶层字段和responseFormat两个固定字段，使用自身数据属性描述符；顶层及非null嵌套对象的原型必须严格等于Object.prototype，拒绝null原型、数组、自定义原型及其他原型。拒绝额外字段、symbol、accessor、非法枚举及不合法阶段组合。拒绝Proxy检查异常且不让异常逃出；不主动调用getter、toJSON或异常序列化。返回独立、冻结的顶层及嵌套对象。v3有限序列化上限2048 UTF-8字节；不修改旧v1/v2规则。

适配器的首个失败原因、最多一次回调、已有计时和清理顺序不变。分类器/投影或观察器同步抛错、异步拒绝、永不settle都不得改变Research结果、charged unknown、预算保留、原异常映射或等待时间；观察器不被await。分类失败保留原传输诊断并使responseFormat为null；投影失败沿现有安全路径丢弃观察，不改变业务。

本地validation接收v3并再次严格投影，继续写私有Summary。默认离线/未调用路径为null。生产factory、公开API、D1/R2、运行审计及客户端均不注入或保存新分类。

保持请求字节、profile kimi-low-output32k-v3、输出策略kimi-complete-quality-v2、Kimi low/32768、10搜索50结果、USD5、20/21/22分钟全部不变。标准Research/Repair也不改变。观察版本升级不冒充请求策略变化，不新增Provider调用、自动重试、Key读取或日志正文采集。

## 实施与验收边界

批准后再写实施计划，沿已批准的子代理驱动、TDD、每任务SPEC后QUALITY/安全审查流程。

- Task1：纯分类器、v3投影和本地适配器观察。先RED证明四类同样1100字节的输入缺少区分；GREEN验证格式分类、header/body矛盾、空/BOM/Unicode空白、参数化MIME、ASCII大小写与边界、坏UTF-8及超限路径、逐字节UTF-8合法JSON控制。合法JSON错误对象保持原结果观察，不被归为外层解析失败。
- Task2：私有Summary与兼容验收。通过实际guarded transport及临时SQLite验证一次POST、Repair0、失败unknown保留、隔离/重复拒绝/销毁；observer开关、throw/reject/不settle的结果与持久状态相同。检查v1/v2原形状及v3严格拒绝、秘密哨兵不泄漏、生产不注入、本地和标准请求字节未变。
- Root：相关回归、非增量类型检查、定向lint；按项目要求进行本地构建和默认零真实请求终端演练。根据源码变更选择范围，不把合成通过宣称为第十五次修复，也不自动重跑所有不相关功能。

现有108项候选加第十五次Summary的109项保护清单保留为实施前基线。获准后只记录明确修改的新候选，不覆盖旧实测或伪称修改文件未变。没有Git写入许可，设计原地保存。

## 后续与批准边界

第十五次Activity最终状态和费用仍可补充，但不是本地设计审阅或离线实施的前置要求。新的付费验证必须另有明确次数/预算许可；本设计批准本身不包含该许可。未来真实响应若再次失败，应按具体分类和Provider证据决定修复或独立架构调整，不无条件进入下一次试跑。

Root自审：范围限定于已有失败后的有限观察，协议和严格接受规则保持；明确已知/未知、兼容、异常旁路和恢复位置。独立response_format_design_review结论READY，无阻塞P1/P2；两项非阻塞建议（HTTP/HTML空白代码点、允许原型）已明确到本文。用户批准前不写实施代码，批准后从writing-plans开始，无需重复索取已批准的子代理/TDD/双审流程许可。
