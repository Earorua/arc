# Arc v8 32k 本地输出预算实施记录

**2026-09-12 实测更新：** 第十三次已执行并消耗许可，stop / 185257ms / 3次搜索 / 可信USD0.134539 settled；引用annotations-invalid，未进入结构/课程质量或规划，完整真实验收未通过。具体见 `v8-thirteenth-annotations-result-2026-09-12.md`。原53项冻结指纹一致，追加回执共54项保护；本轮只有安全回执、14组合成调查和新的诊断设计，没有实施源码修改或重复既有测试。32k三任务与最终1252项/双审/build通过仍为本地证据。新响应预检设计已独立SPEC READY、待用户批准，没有第十四次/Repair/重试/生产/Git/Sites许可。以下为本地实施过程历史。

2026-09-11：用户批准并要求提高输出上限，高质量规划与稳定跑通优先。已记录32768输出、1200/1260/1320秒本地期限及质量优先完整提示，USD5/10次搜索50结果/严格质量边界保持。旧等待设计批准的条件解除，按原完整发布目标推进；本轮初始目标工具曾显示此前blocked，最新get_goal已确认active，不创建替代目标。

设计：`../superpowers/specs/2026-09-11-arc-v8-kimi-output-budget-design.md`；实施计划：`../superpowers/plans/2026-09-11-arc-v8-kimi-output-budget.md`。32k/期限/诊断v2调整经独立只读设计审查确认协调方向可行；执行仍需TDD与先规格后质量双审，不能提前记为通过。

基线：分支codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc；原33项冻结指纹全部匹配，另保存本次Summary、launcher测试和实质fixture，共37项before快照，位于ignored `outputs/local-output-budget-20260911/`。现有74份有意改动保留，无Git写入。

Task1首项RED已取得：默认沙箱Vite/esbuild spawn EPERM不是RED；同一范围离线测试经升级执行后，实际请求断言expected32768 / received12000，1项失败、1.33秒。实现者继续补profile/deadline/v2/PowerShell的行为RED后修改代码，当前未宣称GREEN。Task2待Task1双审。没有第十三次真实许可、没有读取Key/env/正文、生产或Sites写入。第十二次仍为length失败，费用USD0.242346，历史证据不改写。

Task1已完成：扩展RED为4文件19失败/124通过，覆盖profile/deadline/v2/PowerShell；阶段回归7文件275/275通过（48.63秒），类型和触及文件lint退出0。10项after指纹与28项保护指纹均独立核对一致。先SPEC READY，后QUALITY READY，无待修问题；审查为只读，核对实际增量及记录，没有冒称审查者重新运行测试。Task2已由新实现者接手，处理fingerprint/Summary和完整合成验证；最终Root整合验证仍待。

Root另发现native传输时间边界未协调：runner捕获未配置的Node fetch，本机Node24.14.1/内置Undici7.24.4的headers/body默认300000ms；应用20分钟AbortController不会提高底层默认限制。已用4次纯127.0.0.1模拟请求证明显式每请求dispatcher可覆盖headers与body时间限制：100ms配置约1秒报对应超时，5000ms配置均接收1800ms延迟的完整模拟响应。初版250ms延迟不足以超过底层低精度计时器，未出现预期拒绝，保留初版证据后调整实验；不得将此算作应用TDD RED。新证据 `native-timeout-investigation-v2.json`，无外部请求、无Key。此发现尚不能证明第十一次历史失败原因。

Task3具体方案已写入设计/计划并独立READY：仅Research POST使用专用direct Agent，GET和其他模式保持原native；strict getter先校验，nativeResponse先初始化，再动态import已安装Undici；有限独立cleanup和globaldispatcher不变须行为验证。仅明确追加runner、新helper/tests和package/lock根devDependency7.24.8声明，不安装或下载包。原3项Task3before快照已保存，新final-protected19项一致；旧28/22清单不覆盖。Task3须在Task2双审后顺序开始。

Task2实现冻结、审查中：8文件229项通过，另malformed-profile13项通过；类型/lint退出0。RED来自实际合成runValidation回执缺少maxOutputTokens/outputPolicyVersion，非启动错误。新覆盖完整fixture激活/规划、可信length结算且不解析残缺候选、20分钟fakeclock诊断v2不过早饱和、各策略字段fingerprint敏感性和实际DB保存对应。Root读取了新测试和源码，最终独立SPEC→QUALITY及整合验证仍待；未把合成成功计作真实通过。

Task2规格初审指出P2测试遗漏：SQLite run/package指纹只彼此比较，未独立证明其输出策略描述。revision1新增独立期望SHA256并同时断言两项存储值；仅临时把fingerprint的output.maxTokens改回12000时该断言失败，随后立即恢复源文件原hash，最终只持久修改测试。19项定向GREEN、类型/lint退出0；当前9项/22项保护/Task1的10项指纹一致。独立SPEC复审READY，P2关闭，QUALITY审查进行中。最终描述指纹为 `d49c3eea8c64ec7efedc7173d157288a87150515e76dc30ee645f0011bcd6966`，原证据和revision1分别保留。

Task2最终QUALITY READY，无待修问题；独立核对9项冻结快照，标准行为/严格profile/实际规划/费用与20分钟诊断路径均满足。本阶段完成，新的Task3实现者已接手native期限TDD；没有并行实施或提前运行最终构建。下一次真实交接草稿 `v8-output-budget-live-validation-2026-09-11.md` 已准备范围但未冻结、无执行许可。

Task3已取得有意义RED：隔离子进程执行实际runner，仅注入合成fetch和非真实stdin；Key GET通过且未带dispatcher，Research POST因缺少dispatcher而失败，预期可信length/结算断言失败。此证据为实际调用路径缺口，不是缺文件/import错误，记录 `task3-RED.txt`。随后实施专用本地连接及有限清理，当前未宣称GREEN。

Task3阶段GREEN：7文件303项通过（57.03秒），追加启动参数/输入断言后14项定向通过，类型/lint退出0。Root保存5项完整after快照，helper固定5秒有引用的清理计时器，防止仅剩清理等待时进程提前退出；软件依赖仅新增已有Undici7.24.8根声明，Root独立比较整个lock图与before一致。独立SPEC初审指出P2正文取消测试尚未保证客户端reader阶段、P3临时目录删除前缺显式边界校验；只重开新测试文件修正，生产实现未发现其他偏差。待同一SPEC复审后才进行QUALITY，当前未宣称Task3完成。

Task3 revision1 已冻结并 SPEC READY：P2 正文取消测试明确收到原生 Response、读到 partial、挂起第二次读取后 abort 并验证拒绝；P3 删除临时目录前检查解析父目录与固定前缀。只改新测试文件，生产实现不变。14项定向 GREEN、类型/lint退出0；5项 revision1 manifest 与完整快照一致，独立 SPEC 复审关闭 P2/P3，无新增发现。

**用户随后要求保存并暂时关闭 Codex，本轮已暂停。** QUALITY reviewer 已停止，报告 PARTIAL / NOT COMPLETE：只读过审查指导，尚未检查源码，无具体发现、不作 READY 判断。Task3 QUALITY 是恢复第一项。Root 最终31套件/类型/lint、当前构建与产物校验、默认离线终端演练、最终整合审阅及候选冻结均未运行。已准备的 final-candidate-files.json 只是52项候选清单，verify-build-artifacts.ps1 尚未运行。

暂停核对：分支/HEAD一致；Task1 10项、Task2 revision1 9项、Task3 revision1 5项、最终保护19项全部匹配。另保存52项恢复指纹于 `outputs/local-output-budget-20260911/user-pause-20260911.json`，不是最终候选冻结。最终 Task3 test SHA256 为 d0d9033c23318234d5d910cc633716f2e17c042ff31983dff920cddd03265bf2；旧快照保留。源代码与全部有意未提交成果保留，不暂存/提交/推送。无新测试/构建/真实请求/生产/Sites操作，第十二次许可消耗，无第十三次；目标尚未完成，等待用户恢复。

2026-09-12 用户恢复：分支/HEAD及52项暂停指纹重新一致，完整目标active。Task3独立质量复审 READY，无P1/P2/P3；审查读取五个冻结文件和关联边界，并以不打开socket的合成dispatcher探针确认nativefetch不覆盖Agent期限，未运行测试/build。依赖全图和19项保护文件另行一致。

Root最终验证：31文件1252/1252，52.70秒，非增量类型与18文件lint exit0；默认沙箱Vite spawn EPERM属于启动限制，范围限定的同套离线测试经升级成功。当前Sites0.1.62/portable configured=false，保留现有项目脚本；独立本地build也仅因spawn EPERM升级后五阶段exit0。15迁移/元数据与hosting源/产物一致，38客户端文件；Worker2355268 bytes，SHA256 05A082BF03394BB6FDF47ADD94EB9EA1C77DB974B6DC33AE4075CCE4324E25FE，静态defaultfetch导出已核对，本地nativehelper未进入Worker。无安装或包图变化。

实际默认PowerShell无模式演练exit0：summary-2026-09-12T03-54-48-534Z.json，SHA256 d4da0ec79674e4579cf07e958adf502f7931fbf45a61bde7cec75cd8c70abcb6，offline-dry-run/passed/realRequestCount0/ready，质量/激活/规划/owner隔离/第二次请求拒绝/临时库销毁通过；来源和费用均为既有合成fixture，不能计作真实验收。

完整报告 outputs/local-output-budget-20260911/root-final-validation-20260912.json；新53项候选/保护/离线回执清单 root-final-candidate-hashes-20260912.json 保留原52项匹配。最终独立整合审查正在进行，尚不写FINAL READY。无第十三次许可或真实调用，公开目标未完成，无生产/Git/Sites写入。

最终独立整合审查 output32k_final_integration_review 为 FINAL READY FOR LOCAL CANDIDATE，无P1/P2/P3。审查实际源码/批准设计/任务before快照，涵盖本地标准隔离、prompt/schema、保存指纹、诊断边界、原生初始化/清理、依赖图，独立匹配53项和19项保护指纹；引用Root新1252项/类型/lint/build/离线演练证据，未冒称自己重跑。全部本地工作完成，具体第十三次方案已可审阅，本回合首次申请新许可；真实质量、线上接入和公开发布仍未通过。
