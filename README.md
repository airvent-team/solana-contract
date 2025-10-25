# AIR Token - IoT Reward System

IoT 장비에서 대기질 데이터를 수집하면 AIR 토큰 리워드를 받을 수 있는 Solana 스마트 컨트랙트입니다.

## 주요 특징

- **고정 공급량**: 10억 AIR 토큰 (Mint Authority 영구 제거)
- **장비 기반 리워드**: 리워드가 유저가 아닌 장비에 귀속
- **4년 반감기**: 비트코인과 유사한 시간 기반 반감기 메커니즘
- **Treasury 배분**: 사전 발행된 토큰을 Treasury에서 배분
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
    ├── data.rs              # 데이터 제출 (submit_data)
    └── reward.rs            # 리워드 시스템 (claim_rewards)
```

### 주요 계정 구조

- **DeviceRegistry**: 장비 정보 (device_id, owner, registered_at, is_active)
- **RewardConfig**: 전역 리워드 설정 (initial_reward, start_timestamp)
- **DeviceRewards**: 장비별 누적 리워드 (accumulated_points, total_data_submitted)

### 이벤트

- **DataSubmitted**: IoT 데이터 제출 이벤트 (device_id, pm25, pm10, reward_amount, halving_epoch, owner, timestamp)
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
   - PDA로 DeviceRegistry 계정 생성

2. **소유권 이전** (`transfer_ownership`)
   - 장비를 다른 지갑으로 이전
   - 누적된 리워드도 함께 이전됨

3. **리워드 수령** (`claim_rewards`)
   - 장비에 누적된 포인트를 AIR 토큰으로 수령
   - Treasury → Owner Token Account로 전송
   - 포인트 초기화 (0으로 리셋)

4. **장비 비활성화** (`deactivate_device`)
   - 장비를 비활성 상태로 전환
   - 비활성 장비는 데이터 제출 불가

### 서버 (백엔드)

**데이터 수집** (`submit_data`)
- IoT 장비가 PM2.5, PM10 데이터 전송
- 자동으로 리워드 포인트 누적
- 4년 반감기에 따라 리워드 계산
- DataSubmitted 이벤트 발생 (온체인 영구 저장)
- **보안**: 등록되지 않은 장비는 데이터 제출 불가
- **보안**: 비활성(is_active=false) 장비는 데이터 제출 불가

## 리워드 메커니즘

### 시간 기반 4년 반감기

- **Epoch 0** (0-4년): 100 AIR per data
- **Epoch 1** (4-8년): 50 AIR per data
- **Epoch 2** (8-12년): 25 AIR per data
- ...

반감 시점은 `reward_config.start_timestamp` 기준으로 계산됩니다.

### 장비 기반 리워드

- 리워드는 유저가 아닌 **장비에 귀속**
- 장비 소유권 이전 시 리워드도 함께 이전
- 소유자는 언제든지 누적된 리워드를 claim 가능

## 테스트

### 전체 테스트 실행

```bash
anchor test
```

### 테스트 구조 (총 32개 테스트)

- `tests/airvent-contract.ts` - 토큰 초기화 기본 테스트 (1개)
- `tests/device-registry.ts` - 장비 등록/이전/비활성화 (10개)
- `tests/data-rewards.ts` - 데이터 수집, 리워드, 이벤트, 보안 테스트 (13개)
  - 데이터 제출 및 리워드 누적
  - 장비 소유권 이전 시 리워드 보존
  - **DataSubmitted 이벤트 발생 검증**
  - **등록되지 않은 장비 차단**
  - **비활성 장비 데이터 제출 차단**
  - **리워드 0일 때 상태 검증**
  - **소유권 제약 검증 (has_one)**
- `tests/e2e.ts` - 전체 플로우 통합 테스트 (9개)

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
- **소유권 검증**: has_one constraint로 소유자만 claim/transfer 가능
- **활성 상태 검증**: 비활성(is_active=false) 장비는 데이터 제출 불가
- **등록 상태 검증**: 등록되지 않은 장비는 데이터 제출 불가 (AccountNotInitialized 에러)

### 데이터 무결성
- DataSubmitted 이벤트를 통한 모든 IoT 데이터 온체인 영구 저장
- 이벤트는 프로그램 로그에 저장되어 변조 불가능
- Helius/Triton 인덱서로 전체 히스토리 쿼리 가능
