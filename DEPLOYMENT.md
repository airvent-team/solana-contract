# AIR Token 배포 가이드

---

## 빠른 참조

### 명령어 요약

| 작업 | 명령어 |
|------|--------|
| 빌드 | `anchor build` |
| 배포 (로컬넷) | `anchor deploy` |
| 배포 (Devnet) | `anchor deploy --provider.cluster devnet` |
| 배포 (Mainnet) | `anchor deploy --provider.cluster mainnet-beta` |
| 초기화 | `anchor migrate` |
| 테스트 | `anchor test` |


---

## 로컬넷 배포

### Step 1: 로컬 Validator 시작

```bash
anchor localnet
```

### Step 2: 빌드 및 배포

```bash
anchor build
anchor deploy
```

출력된 Program ID를 확인:
```
Program Id: 7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB
```

### Step 3: Program ID 업데이트

`programs/airvent-contract/src/lib.rs`:
```rust
declare_id!("7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB");
```

`Anchor.toml`:
```toml
[programs.localnet]
airvent_contract = "7HjcqvBdLaj6JzH5x3shJcSjaig4SXqwMJGQCbDLyVVB"
```

### Step 4: 재빌드 및 초기화

```bash
anchor build
anchor migrate
```

**초기화 내용:**
- AIR Token 생성 (1B 공급량)
- Mint Authority 제거
- Reward Config 설정
- Mint keypair 저장 (`.keys/mint-keypair.json`)

### Step 5: 테스트

```bash
anchor test
```

---

## Devnet 배포

### Step 1: SOL Airdrop

```bash
solana config set --url devnet
solana airdrop 2
solana balance  # 최소 2 SOL 권장
```

### Step 2: 빌드 및 배포

```bash
anchor build
anchor deploy --provider.cluster devnet
```

### Step 3: Program ID 업데이트 및 초기화

출력된 Program ID로 `lib.rs`와 `Anchor.toml` 업데이트 후:

```bash
anchor build
anchor migrate --provider.cluster devnet
```

### Step 4: Explorer 확인

```
https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet
```

---

## Mainnet 배포

⚠️ **주의:** 실제 SOL 비용 발생, 되돌릴 수 없음

### 사전 체크리스트

- [ ] 모든 테스트 통과
- [ ] 코드 감사 완료
- [ ] 충분한 SOL 보유 (10+ SOL 권장)
- [ ] Multisig 지갑 준비

### Step 1: Mainnet 지갑 준비

```bash
solana-keygen new --outfile ~/.config/solana/mainnet-wallet.json
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/mainnet-wallet.json
solana balance
```

### Step 2: 빌드 및 배포

```bash
anchor build --verifiable
anchor deploy --provider.cluster mainnet-beta
```

### Step 3: Program ID 업데이트 및 초기화

```bash
# lib.rs와 Anchor.toml 업데이트 후
anchor build --verifiable
anchor migrate --provider.cluster mainnet-beta
```

### Step 4: 배포 검증

```bash
solana program show <PROGRAM_ID>

# Mint 확인
spl-token supply <MINT_ADDRESS>  # Expected: 1000000000

# Mint Authority 제거 확인
spl-token display <MINT_ADDRESS> | grep "Mint authority"  # Expected: (not set)
```

---

## 네트워크 전환

### Anchor.toml 수정 (권장)

```toml
[provider]
cluster = "devnet"  # localnet, devnet, mainnet-beta
wallet = "~/.config/solana/id.json"
```

### CLI 옵션 사용

```bash
anchor deploy --provider.cluster devnet
anchor migrate --provider.cluster devnet
```

### 네트워크별 RPC

| 네트워크 | RPC URL |
|---------|---------|
| localnet | http://localhost:8899 |
| devnet | https://api.devnet.solana.com |
| mainnet-beta | https://api.mainnet-beta.solana.com |

---

## Anchor 명령어

### anchor build

```bash
anchor build              # 일반 빌드
anchor build --verifiable # 검증 가능한 빌드 (Mainnet)
```

### anchor deploy

```bash
anchor deploy                                    # Anchor.toml cluster 사용
anchor deploy --provider.cluster devnet          # Devnet
anchor deploy --provider.cluster mainnet-beta    # Mainnet
```

### anchor migrate

⚠️ **중요:** `anchor migrate`는 배포하지 않습니다. `migrations/deploy.ts` 스크립트만 실행합니다.

```bash
anchor migrate                                   # 초기화
anchor migrate --provider.cluster devnet         # Devnet 초기화
```

**수행 작업:**
- AIR Token 초기화 (1B 공급량, Mint Authority 제거)
- Reward Config 초기화 (100 AIR/data, 4년 반감기)

### anchor upgrade

```bash
anchor upgrade target/deploy/airvent_contract.so --provider.cluster devnet
```

### anchor test

```bash
anchor test                         # 전체 테스트
anchor test -- --grep "Device"      # 특정 테스트
```

---

## Program ID 관리

### Keypair 백업

```bash
# Mainnet keypair 백업 (필수!)
cp target/deploy/airvent_contract-keypair.json \
   backup/airvent_contract-mainnet-$(date +%Y%m%d).json
```

### Program ID 변경 시점

1. 로컬넷 재시작 후 첫 배포
2. 새 네트워크 첫 배포 (Devnet → Mainnet)
3. Keypair 삭제 후 배포

### 변경 절차

1. 배포 후 Program ID 확인
2. `lib.rs` → `declare_id!()` 업데이트
3. `Anchor.toml` → `[programs.<cluster>]` 업데이트
4. 재빌드

---

## 트러블슈팅

### Program ID 불일치

**에러:**
```
Error Code: DeclaredProgramIdMismatch
```

**해결:**
```bash
solana address -k target/deploy/airvent_contract-keypair.json
# lib.rs의 declare_id!() 업데이트
anchor build
```

### Authority 에러

**에러:**
```
Program's authority does not match
```

**해결 (로컬넷):**
```bash
rm -f target/deploy/airvent_contract-keypair.json
anchor build
anchor deploy
```

**해결 (Devnet/Mainnet):**
```bash
solana program show <PROGRAM_ID>  # Authority 확인
solana config set --keypair <올바른_지갑>
```

### 잔액 부족

```bash
# 로컬넷/Devnet
solana airdrop 10

# Mainnet
# 거래소에서 SOL 전송
```

### RPC 연결 실패

```bash
solana config get
solana config set --url https://api.devnet.solana.com
```

### Migration 에러

```bash
# IDL 없음
anchor build

# 지갑 없음
solana-keygen new --outfile ~/.config/solana/id.json
```

---

## 사전 준비

### 도구 설치

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked

# 버전 확인
solana --version  # v1.18+
anchor --version  # 0.32.1
```

### 지갑 생성

```bash
solana-keygen new --outfile ~/.config/solana/id.json
solana address
```

---

## 참고 자료

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Explorer](https://explorer.solana.com/)
