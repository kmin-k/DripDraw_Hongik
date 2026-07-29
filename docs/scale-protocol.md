# Felicita Arc BLE 프로토콜

> 현재 내용은 커뮤니티 역공학 자료 기반입니다. 실물 저울과 펌웨어에서 반드시 다시 검증해야 합니다.

## GATT

| 항목 | 값 |
|---|---|
| Service UUID | `0000ffe0-0000-1000-8000-00805f9b34fb` |
| Characteristic UUID | `0000ffe1-0000-1000-8000-00805f9b34fb` |
| Characteristic | notify(수신), write(명령) |
| Heartbeat | 불필요한 것으로 알려짐 |

## 무게 패킷

- 알려진 길이: 18-byte ASCII
- 부호: index 2, `0x2B`는 양수, `0x2D`는 음수
- 숫자: index 3~8의 ASCII 숫자 6자리
- 단위: 0.1 g이므로 정수 파싱 후 10으로 나눔

```ts
export function parseWeight(data: DataView): number {
  if (data.byteLength < 9) return Number.NaN;

  const signByte = data.getUint8(2);
  if (signByte !== 0x2b && signByte !== 0x2d) return Number.NaN;

  let digits = "";
  for (let index = 3; index <= 8; index += 1) {
    const byte = data.getUint8(index);
    if (byte < 0x30 || byte > 0x39) return Number.NaN;
    digits += String.fromCharCode(byte);
  }

  const sign = signByte === 0x2b ? 1 : -1;
  return (sign * Number.parseInt(digits, 10)) / 10;
}
```

의사코드보다 방어적으로 부호와 숫자 범위를 검사한 예시입니다. 실제 모듈 구현 시 raw 패킷 fixture 기반 단위 테스트를 추가합니다.

## 명령

| 명령 | Byte | 기능 |
|---|---:|---|
| `T` | `0x54` | 영점 |
| `R` | `0x52` | 타이머 시작 |
| `S` | `0x53` | 타이머 정지 |
| `C` | `0x43` | 타이머 리셋 |
| `2` | `0x32` | weight + timer 모드 |

## 실물 검증 체크리스트

- [ ] 공식 앱과의 기존 연결을 완전히 해제했다.
- [ ] Service/Characteristic UUID를 실제 GATT에서 확인했다.
- [ ] 빈 저울, 100 g 기준물, 음수 무게의 raw hex를 기록했다.
- [ ] 패킷 길이와 부호·숫자 오프셋을 확인했다.
- [ ] notify 주기와 연결 끊김 동작을 기록했다.
- [ ] 명령별 write 결과를 확인했다.
- [ ] 검증한 저울 펌웨어 버전과 날짜를 함께 기록했다.

raw hex에는 개인 정보가 없더라도 원본 로그와 해석 결과를 구분해 보관합니다.

