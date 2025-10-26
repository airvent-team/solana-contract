# 스크립트 사용 가이드

이 문서는 AIR Token 프로젝트에서 제공하는 유틸리티 스크립트 사용법을 안내합니다.

## 목차

- [디바이스 등록](#디바이스-등록)
- [소유권 이전](#소유권-이전)
- [여러 지갑 관리](#여러-지갑-관리)

---

## 디바이스 등록

**스크립트**: `scripts/register-device.ts`

새로운 IoT 디바이스를 블록체인에 등록합니다.

### 사용법

```bash
# 랜덤 device_id로 등록 (예: DEV-abc123de)
yarn ts-node scripts/register-device.ts

# 특정 device_id로 등록
yarn ts-node scripts/register-device.ts SENSOR001

# 커스텀 device_id (최대 32자)
yarn ts-node scripts/register-device.ts AQ-20251026-8478
```

### 기능

- ✅ device_id를 파라미터로 받음 (최대 32자)
- ✅ 파라미터 없으면 랜덤 생성
- ✅ 중복 등록 체크
- ✅ SOL 잔액 확인
- ✅ 등록 후 device 정보 출력
- ✅ Solscan 링크 제공

### 출력 예시

```
╔═══════════════════════════════════════════════════════╗
║            Register Device                            ║
╚═══════════════════════════════════════════════════════╝

📋 Configuration:
   Program ID:  7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB
   Network:     https://api.devnet.solana.com
   Owner:       EyPBJ8urskTHLEdp2ob6bEdzSn1hefTiUojf9XSBnco6
   Device ID:   "AQ-20251026-8478"
   Device PDA:  L9SJfdD56aXpzuLaiMZDhbAEmZr4HFdwypbJpavsXxM
   Rewards PDA: 5ZZ1b8M3gZFMyQKstwy7UL3QVnjt8U2YTta7xayhWZYN

✅ Device registered successfully!
```

### 주의사항

- device_id는 최대 32자까지 가능
- 등록에는 ~0.01 SOL의 rent가 필요
- 중복된 device_id는 등록 불가

---

## 소유권 이전

**스크립트**: `scripts/transfer-ownership.ts`

등록된 디바이스의 소유권을 다른 지갑으로 이전합니다.

### 사용법

```bash
# 기본 사용법
yarn ts-node scripts/transfer-ownership.ts <device_id> <new_owner_pubkey>

# 예시
yarn ts-node scripts/transfer-ownership.ts AQ-20251026-8478 F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No
```

### 기능

- ✅ 현재 소유자 검증
- ✅ 디바이스 존재 여부 확인
- ✅ 소유권 이전 트랜잭션 실행
- ✅ 업데이트된 디바이스 정보 출력
- ✅ Solscan 링크 제공

### 출력 예시

```
╔═══════════════════════════════════════════════════════╗
║        Transfer Device Ownership                      ║
╚═══════════════════════════════════════════════════════╝

📋 Transfer Details:
   Device ID:    "AQ-20251026-8478"
   Current Owner: EyPBJ8urskTHLEdp2ob6bEdzSn1hefTiUojf9XSBnco6
   New Owner:     F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No

✅ Ownership transferred successfully!

📱 Updated Device Info:
   Device ID:     AQ-20251026-8478
   New Owner:     F47u5hNqRjJ3A8baEbH6KXZGNMq3YMUVDbWVy3yYV2No
   Active:        true
```

### 주의사항

- **현재 소유자의 지갑(`~/.config/solana/id.json`)으로만 실행 가능**
- 이전 후 리워드는 새 소유자에게 자동 전송됨
- 소유권 이전은 되돌릴 수 없으므로 신중하게 진행

---

## 여러 지갑 관리

Solana CLI로 여러 지갑을 생성하고 관리할 수 있습니다.

### 지갑 생성

```bash
# 새 지갑 생성
solana-keygen new -o ~/.config/solana/user1.json --no-bip39-passphrase
solana-keygen new -o ~/.config/solana/user2.json --no-bip39-passphrase
solana-keygen new -o ~/.config/solana/treasury.json --no-bip39-passphrase
```

### 지갑 전환

```bash
# 현재 사용 중인 지갑 확인
solana config get

# 지갑 전환
solana config set --keypair ~/.config/solana/user1.json
solana config set --keypair ~/.config/solana/user2.json
solana config set --keypair ~/.config/solana/id.json  # 기본으로 복귀
```

### 지갑 주소 확인

```bash
# 현재 지갑 주소
solana address

# 특정 지갑 파일의 주소 확인
solana-keygen pubkey ~/.config/solana/user1.json
solana-keygen pubkey ~/.config/solana/user2.json
```

### 스크립트에서 특정 지갑 사용

스크립트를 실행하기 전에 지갑을 전환하면 해당 지갑으로 트랜잭션이 실행됩니다:

```bash
# user1 지갑으로 디바이스 등록
solana config set --keypair ~/.config/solana/user1.json
yarn ts-node scripts/register-device.ts MY-DEVICE-001

# 기본 지갑으로 복귀
solana config set --keypair ~/.config/solana/id.json
```

### Devnet에서 SOL 받기

```bash
# 현재 지갑에 SOL airdrop
solana airdrop 2 --url devnet

# 특정 주소에 SOL airdrop
solana airdrop 2 <ADDRESS> --url devnet
```

---

## 트러블슈팅

### "Insufficient balance" 에러

```bash
# Devnet에서 SOL 받기
solana airdrop 2 --url devnet

# 잔액 확인
solana balance --url devnet
```

### "You are not the owner" 에러

현재 설정된 지갑이 디바이스의 소유자가 아닙니다. 올바른 지갑으로 전환하세요:

```bash
# 현재 지갑 확인
solana address

# 올바른 지갑으로 전환
solana config set --keypair ~/.config/solana/owner-wallet.json
```

### "Device not found" 에러

디바이스가 등록되지 않았습니다. 먼저 `register-device.ts`로 등록하세요:

```bash
yarn ts-node scripts/register-device.ts YOUR-DEVICE-ID
```

---

## 다음 단계

- [배포 가이드](./DEPLOYMENT.md) - 네트워크별 배포 방법
- [README](./README.md) - 프로젝트 개요 및 아키텍처
