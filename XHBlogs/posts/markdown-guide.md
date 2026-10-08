---
title: 博客写作语法速查
date: 2026-10-08 12:00:00
description: 这篇文章演示了本站文章支持的全部写法：代码块、提示框、黑幕、脚注、图注、表格和公式，写文章时可以直接照抄。
tags:
  - 写作
  - 指南
series: 博客使用指南
---

这篇文章既是效果演示，也是写作时的速查表。不需要的话，直接删掉 `posts/markdown-guide.md` 即可。

正文里中文和English、数字2026之间会自动补上空格，写的时候不用刻意留空。

## 代码块

在 ``` 后面写语言名就有高亮；再加 `title="文件名"` 会显示文件名标题。右上角可以一键复制。

```tsx title="components/Hello.tsx" {4}
import { useState } from 'react';

export default function Hello() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>点了 {count} 次</button>;
}
```

用注释标记新增和删除的行（标记本身不会显示出来）：

```ts
function greet(name: string) {
  console.log('Hello ' + name); // [!code --]
  console.log(`你好，${name}！`); // [!code ++]
}
```

也可以直接写 diff：

```diff
- const theme = 'light';
+ const theme = 'dark';
  export default theme;
```

超过 25 行的代码会自动折叠，点「展开全部」查看：

```python
# 一个简单的冒泡排序，用来演示长代码折叠
def bubble_sort(items):
    n = len(items)
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if items[j] > items[j + 1]:
                items[j], items[j + 1] = items[j + 1], items[j]
                swapped = True
        if not swapped:
            break
    return items


def main():
    data = [64, 34, 25, 12, 22, 11, 90]
    print("排序前：", data)
    result = bubble_sort(data.copy())
    print("排序后：", result)
    assert result == sorted(data)

    words = ["樱花", "骑士", "书架", "音乐"]
    print("按拼音以外的规则排序：", bubble_sort(words.copy()))


if __name__ == "__main__":
    main()
```

## 提示框

> [!NOTE]
> 普通的补充说明。

> [!TIP] 小技巧
> 标记后面可以写自定义标题。

> [!IMPORTANT]
> 需要特别留意的内容。

> [!WARNING]
> 可能出问题的地方。

> [!CAUTION]
> 危险操作，务必小心。

> [!NOTE]- 点我展开（可折叠的提示框）
> 在标记后面加 `-` 默认收起，加 `+` 默认展开。

普通引用还是原来的样子：

> 人生不如意事十之八九。

## 黑幕

写剧透时用两条竖线包起来：Saber 最后||回到了卡姆兰之丘||。点一下就能看到。

## 脚注

鼠标移到角标上可以直接预览脚注[^1]，不用跳到文末。手机上点一下角标即可[^note]。

[^1]: 这里是脚注的内容，可以写 **加粗** 和 [链接](https://github.com)。
[^note]: 第二个脚注。

## 图片

图片下方会显示说明文字（取自 `![说明](地址)` 里的说明），点击图片可以放大：

![浮世绘风格的初音](/images/gallery/cover-miku-ukiyoe.webp)

连续放几张图片，会自动排成网格：

![Saber](/images/bg/bg-mobile-saber.webp)
![初音](/images/bg/bg-mobile-miku.webp)

## 表格

宽表格在手机上可以左右滑动：

| 写法 | 效果 | 适用场景 | 备注 |
| --- | --- | --- | --- |
| `> [!TIP]` | 绿色提示框 | 补充技巧 | 支持自定义标题 |
| `\|\|剧透\|\|` | 黑幕 | 番剧、小说剧透 | 点击显示 |
| `[^1]` | 脚注 | 引用出处 | 悬停预览 |
| `title="a.ts"` | 代码标题 | 展示文件 | 也可写成 ts:a.ts |

## 公式

行内公式 $E = mc^2$，以及独占一行的长公式（手机上可以左右滑动）：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi} \qquad \sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6} \qquad \lim_{n \to \infty}\left(1 + \frac{1}{n}\right)^n = e
$$

## 系列文章

在文章开头的 frontmatter 里写 `series: 系列名`，同一系列的文章（至少两篇）会在文章开头显示系列目录，并标出「第几篇」。

### 小节标题

每个标题右侧悬停时会出现 `#`，点一下即可复制这一节的链接。
