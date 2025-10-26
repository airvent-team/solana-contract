# AIR Token - IoT Reward System

IoT 장비에서 대기질 데이터를 수집하면 AIR 토큰 리워드를 **자동으로 즉시 받을 수 있는** Solana 스마트 컨트랙트입니다.

## 주요 특징

- **고정 공급량**: 10억 AIR 토큰 (Mint Authority 영구 제거)
- **자동 즉시 지급**: 데이터 제출 시 리워드 자동 전송 (수동 청구 불필요)
- **4년 반감기**: 비트코인과 유사한 시간 기반 반감기 메커니즘
- **Treasury 배분**: 사전 발행된 토큰을 Treasury에서 배분
- **다중 센서 데이터**: PM2.5, PM10, 온도, 습도 데이터 수집
- **이벤트 로그**: IoT 데이터를 온체인에 영구 저장 (Helius/Triton 인덱서 쿼리 가능)

## 아키텍처

### 모듈 구조

```
programs/airvent-contract/src/
├── lib.rs                    # 메인 진입점
├── constants.rs              # 상수 정의
├── errors.rs                 # 에러 정의
├── state/
│   ├── device.rs            # DeviceRegistry
│   ├── reward.rs            # RewardConfig, DeviceRewards
│   └── events.rs            # DataSubmitted (이벤트 정의)
└── instructions/
    ├── token.rs             # 토큰 초기화
    ├── device.rs            # 장비 관리
    ├── data.rs              # 데이터 제출 + 자동 리워드 전송
    └── reward.rs            # 리워드 설정 관리
```

### 주요 계정 구조

- **DeviceRegistry**: 장비 정보 (device_id, owner, registered_at, is_active)
- **RewardConfig**: 전역 리워드 설정 (initial_reward, start_timestamp, total_rewards_distributed)
- **DeviceRewards**: 장비별 통계 (device_id, owner, total_data_submitted, last_submission)

### 이벤트

- **DataSubmitted**: IoT 데이터 제출 이벤트
  - 필드: device_id, pm25, pm10, temperature, humidity, reward_amount, halving_epoch, owner, timestamp
  - Solana 프로그램 로그에 영구 저장
  - Helius/Triton 등 인덱서로 히스토리 쿼리 가능

## 배포 가이드

### 빠른 시작 (로컬넷)

```bash
anchor localnet # 로컬넷 실행

anchor build
anchor deploy
anchor migrate
```

**자세한 배포 가이드:**
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - 네트워크 전환, Anchor 명령어, 전체 배포 프로세스, 트러블슈팅

## 유저 플로우

### 장비 소유자

1. **장비 등록** (`register_device`)
   - device_id로 장비를 지갑에 등록
   - PDA로 DeviceRegistry, DeviceRewards 계정 생성

2. **자동 리워드 수령**
   - IoT 장비가 데이터 제출 시 AIR 토큰 **즉시 자동 전송**
   - 별도의 claim 트랜잭션 불필요
   - 사용자 경험 최적화

3. **소유권 이전** (`transfer_ownership`)
   - 장비를 다른 지갑으로 이전
   - 이후 리워드는 새 소유자에게 자동 전송

4. **장비 비활성화** (`deactivate_device`)
   - 장비를 비활성 상태로 전환
   - 비활성 장비는 데이터 제출 불가

### 서버 (백엔드)

**데이터 수집 및 자동 보상** (`submit_data`)
- IoT 장비가 PM2.5, PM10, 온도, 습도 데이터 전송
- **자동으로 AIR 토큰 즉시 전송** (Treasury → Owner Token Account)
- 4년 반감기에 따라 리워드 계산
- DataSubmitted 이벤트 발생 (온체인 영구 저장)
- **보안**: 등록되지 않은 장비는 데이터 제출 불가
- **보안**: 비활성(is_active=false) 장비는 데이터 제출 불가

## 리워드 메커니즘

### 시간 기반 4년 반감기

- **Epoch 0** (0-4년): 0.1 AIR per data (자동 즉시 지급)
- **Epoch 1** (4-8년): 0.05 AIR per data (자동 즉시 지급)
- **Epoch 2** (8-12년): 0.025 AIR per data (자동 즉시 지급)
- ...

반감 시점은 `reward_config.start_timestamp` 기준으로 계산됩니다.

### 자동 즉시 지급 시스템

- 데이터 제출 시 리워드 **자동 즉시 전송**
- 별도의 claim 트랜잭션 불필요
- Treasury → Owner Token Account로 즉시 전송
- 사용자 경험 최적화 및 가스비 절감

## 테스트

### 전체 테스트 실행

```bash
anchor test
```

### 테스트 구조 (총 27개 테스트)

- `tests/airvent-contract.ts` - 토큰 초기화 기본 테스트 (1개)
- `tests/device-registry.ts` - 장비 등록/이전/비활성화 (10개)
- `tests/data-rewards.ts` - 데이터 수집, 자동 리워드, 이벤트, 보안 테스트 (9개)
  - 데이터 제출 시 **자동 즉시 리워드 전송** 검증
  - 장비 소유권 이전 후 리워드 수령자 변경 검증
  - **DataSubmitted 이벤트 발생 검증** (PM2.5, PM10, 온도, 습도 포함)
  - **등록되지 않은 장비 차단**
  - **비활성 장비 데이터 제출 차단**
  - **소유권 제약 검증 (has_one)**
- `tests/e2e.ts` - 전체 플로우 통합 테스트 (7개)
  - 토큰 초기화 → 장비 등록 → 데이터 제출 → 자동 리워드 전송 검증

모든 테스트는 멱등성과 독립성을 보장합니다 (실행 순서 무관).

## 기술 스택

- Solana (Blockchain)
- Anchor 0.32.1 (Framework)
- SPL Token (Token Standard)
- TypeScript (Testing)

## 보안 고려사항

### 토큰 보안
- Mint Authority는 초기화 시 영구 제거됨 (추가 발행 불가)
- Treasury Authority는 안전한 지갑/Multisig 권장

### 장비 관리 보안
- **등록 검증**: DeviceRewards는 register_device에서만 생성 (init_if_needed 제거)
- **소유권 검증**: has_one constraint로 소유자만 transfer 가능
- **활성 상태 검증**: 비활성(is_active=false) 장비는 데이터 제출 불가
- **등록 상태 검증**: 등록되지 않은 장비는 데이터 제출 불가 (AccountNotInitialized 에러)

### 데이터 무결성
- DataSubmitted 이벤트를 통한 모든 IoT 데이터 온체인 영구 저장
- 이벤트는 프로그램 로그에 저장되어 변조 불가능
- Helius/Triton 인덱서로 전체 히스토리 쿼리 가능

## 개발 도구

### Solana CLI로 잔액 확인

로컬넷에서 테스트 시 잔액을 확인하는 방법:

```bash
# SOL 잔액 확인
solana balance --url localhost

# 특정 주소의 SOL 잔액 확인
solana balance <ADDRESS> --url localhost

# AIR 토큰 잔액 확인
spl-token balance <MINT_ADDRESS> --url localhost

# 모든 토큰 계정 확인
spl-token accounts --url localhost

# 특정 소유자의 토큰 계정 확인
spl-token accounts --url localhost --owner <ADDRESS>
```

### 계정 조회 (무료)

리워드 통계는 RPC 호출로 무료 조회 가능:

```typescript
// DeviceRewards 계정 조회 (가스비 없음)
const deviceRewards = await program.account.deviceRewards.fetch(deviceRewardsAddress);
console.log("Total submissions:", deviceRewards.totalDataSubmitted.toString());
console.log("Last submission:", new Date(deviceRewards.lastSubmission.toNumber() * 1000));

// RewardConfig 조회 (가스비 없음)
const config = await program.account.rewardConfig.fetch(rewardConfigAddress);
console.log("Total distributed:", config.totalRewardsDistributed.toString());
```

### 이벤트 데이터 접근

DataSubmitted 이벤트는 프로그램 로그에 저장되며, 다음 방법으로 조회 가능:

**1. 트랜잭션 결과에서 직접 파싱 (실시간)**
```typescript
const tx = await program.methods.submitData(...).rpc();
const txDetails = await provider.connection.getTransaction(tx, {
  maxSupportedTransactionVersion: 0
});
// 로그에서 이벤트 파싱
```

**2. WebSocket 구독 (실시간)**
```typescript
program.addEventListener('DataSubmitted', (event, slot) => {
  console.log('New data:', event.pm25, event.pm10, event.temperature, event.humidity);
  console.log('Reward distributed:', event.rewardAmount);
});
```

**3. 인덱서 사용 (권장)**
- [Helius](https://helius.dev): Enhanced WebSocket 및 히스토리 쿼리
- [Triton](https://triton.one): Geyser 플러그인 기반 인덱싱

**4. 자체 인덱싱**
- Geyser 플러그인으로 프로그램 로그 스트리밍
- PostgreSQL 등 DB에 저장
