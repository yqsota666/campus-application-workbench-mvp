# Capture V1

这是校园招聘秋招抓取模块的最小试做版。

目标：

- 只验证一条最小链路。
- 不做真实登录，不做验证码，不做自动提交。
- 支持官方源、公众号线索、搜索线索的统一结构化。

## Files

- `sources.json`: 来源注册表
- `profile.json`: 个人资料模板
- `preferences.json`: 岗位偏好
- `job.schema.json`: 岗位结构
- `prompts/extract_job.md`: LLM 抽取提示词
- `samples/demo_raw.md`: DemoCorp 样例原文
- `samples/demo_job.json`: 结构化结果样例
- `validate.py`: 本地自检

## Run

```bash
python3 capture_v1/validate.py
```
