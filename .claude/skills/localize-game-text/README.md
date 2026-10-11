# localize-game-text

`localize-game-text` 是一个用于制作、诊断、修复和验证游戏中文本地化补丁的 Codex skill。

它把汉化补丁视为一条完整的证据链：确认游戏与运行时资源路径，提取并保护原始文本结构，
翻译和润色文本，确定性地重新构建资源，以可回滚的方式安装补丁，最后验证运行中的游戏是否
真正加载并正确显示了目标内容。

## 功能

- 盘点脚本、表格、字幕、UI 资源和资源包中的可翻译文本。
- 使用稳定 ID 保存文本记录，避免依赖容易变化的显示顺序。
- 保护占位符、标签、控制码、换行、说话人信息和记录顺序。
- 通过试译与独立审查控制粗翻译质量。
- 校对语义、术语、人物语气和上下文连续性。
- 检查对话、历史记录、角色名和 UI 等不同界面的字体覆盖情况。
- 验证补丁清单、安装文件、发布目录和 ZIP 压缩包是否一致。
- 指导构建支持安装、更新、校验、卸载和故障恢复的可逆 Windows 补丁。

## 安装

将仓库克隆到 Codex 的 skills 目录：

```powershell
git clone https://github.com/LarryE135/localize-game-text.git "$env:USERPROFILE\.codex\skills\localize-game-text"
```

如果 Codex 没有立即识别该 skill，请重启 Codex。

## 使用方法

在任务中引用 `$localize-game-text`，然后描述你的目标。例如：

```text
$localize-game-text 诊断这个汉化补丁已经安装、但游戏没有加载它的原因。
```

```text
$localize-game-text 提取这些脚本中的文本，保留所有控制符，并生成带稳定 ID 的翻译记录。
```

```text
$localize-game-text 检查补丁的字体覆盖、安装清单和发布压缩包，并分别报告包内、安装后和运行时结果。
```

完整工作流和验收门槛请阅读 [SKILL.md](SKILL.md)。

## 目录结构

```text
localize-game-text/
├── SKILL.md          # skill 主说明和工作流
├── agents/           # Codex 界面元数据
├── references/       # 诊断、翻译、字体和发布参考资料
└── scripts/          # 控制符、字体、清单和压缩包验证工具
```

## 附带工具

所有脚本只使用 Python 标准库，需要 Python 3.10 或更高版本。

- `compare_control_tokens.py`：比较稳定 ID、记录顺序和控制符。
- `check_font_coverage.py`：根据字体的真实 Unicode cmap 检查字符覆盖。
- `verify_overlay_manifest.py`：按照 JSON 清单验证已安装文件。
- `verify_release_archive.py`：比较发布目录与 ZIP 压缩包的内容和哈希。
- `audit_release_size.py`：分析压缩包体积、文件类别和大型重复资源。

运行任意脚本时加入 `--help` 可以查看参数说明，例如：

```powershell
python scripts/compare_control_tokens.py --help
```

## 安全与适用范围

本仓库只包含工作流说明和验证工具，不包含任何游戏素材或汉化成品。

请勿提交或公开以下内容：

- 未获授权的游戏资源或受版权保护的汉化文件；
- API 密钥、密码、访问令牌等凭据；
- 用户姓名、私人目录、日志或其他个人信息；
- 无法确认来源及再分发权限的字体、图片和音频资源。

制作和发布补丁前，请确认你有权修改与分发其中包含的所有资源。

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 许可证。
