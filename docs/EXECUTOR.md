# Cloud Run Executor

私有执行服务，部署在用户自有 GCP 项目。Vercel 通过 OIDC → Workload Identity Federation
获取短时身份，不在 Vercel 保存长期 GCP 服务账号私钥。

参考：[Vercel GCP OIDC](https://vercel.com/docs/oidc/gcp)、
[Cloud KMS 非对称加密](https://docs.cloud.google.com/kms/docs/asymmetric-encryption)。

## 允许的 endpoint

公共读取：time、exchangeInfo、ticker、bookTicker、klines、depth。

签名读取：account、openOrders、order、apiRestrictions、Spot/Funding 余额、划转历史。

写入：

- `POST /api/v3/order`
- `DELETE /api/v3/order`
- `POST /sapi/v1/asset/transfer`

其他路径全部拒绝。不接受模型传来的 URL。

## Terraform

`infra/gcp/` 创建 Artifact Registry、私有 Cloud Run、Executor 专用 Service Account、
KMS RSA-OAEP-3072-SHA256、VPC / Cloud NAT 固定出口 IP，以及只匹配个人 Vercel 项目与
指定环境的 WIF 条件。

Cloud Run 入口对公网可调用，但必须携带 Google 签发且 audience 匹配的 ID token。
所有出口流量经过固定 NAT IP，供生产 API Key 白名单使用。

## 本地包

- `packages/executor-contracts`：动作与信封类型。
- `services/binance-executor`：独立 Node 服务，不进入根 TypeScript 工程。

检查：

```text
pnpm --filter binance-executor test
pnpm --filter binance-executor build
terraform -chdir=infra/gcp fmt -check
terraform -chdir=infra/gcp validate
```

未申请用户自有 GCP 项目、未应用 Terraform、未配置 `EXECUTOR_URL` 时，
账户读取和交易执行会明确失败，不会生成模拟成功结果。
