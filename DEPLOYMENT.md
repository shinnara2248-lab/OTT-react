# 운영 배포

스포츠 채팅과 경기 API는 Node 서버가 필요합니다. GitHub Pages 같은 정적 호스팅만으로는 전체 기능이 동작하지 않습니다.

## Node.js 24

- 설치: `npm ci`
- 빌드: `npm run build`
- 시작: `npm start`
- 상태 확인: `GET /healthz` → HTTP 200, `{"status":"ok"}`
- 스포츠 페이지: `/sports` (새로고침과 직접 접속 지원)

서버는 `0.0.0.0`에서 호스팅 서비스가 지정한 `PORT`(기본 3000)를 사용합니다. `/api/sports/*`와 정적 프런트엔드를 같은 주소에서 제공합니다. 프록시에서 SSE 버퍼링을 끄고 장기 연결을 허용하세요. 채팅은 단일 인스턴스 메모리를 사용합니다. 여러 인스턴스로 확장하면 별도 공유 저장소가 필요하며 서버 재시작 시 채팅 내역은 초기화됩니다.

## Docker

`docker build -t ott-react .`

`docker run --rm -p 3000:3000 ott-react`

최종 이미지는 빌드된 프런트엔드와 서버 코드만 포함하며 일반 사용자로 실행됩니다. 빌드 도중 외부 패키지를 설치하므로 npm 레지스트리 접근이 필요합니다.

## 환경변수와 외부 서비스

스포츠 경기 정보에는 ESPN API 및 미디어 호스트의 네트워크 접근이 필요합니다. 상세 내용은 SPORTS.md를 참고하세요. 생중계는 아직 연결되지 않았습니다.

기존 Firebase/TMDB/YouTube 기능에는 해당 `VITE_*` 설정이 필요합니다. Vite 변수는 **프런트엔드 빌드 시점에** 포함됩니다. Node로 배포할 때는 배포 서비스의 빌드 환경에서 설정하세요. 기본 Docker 빌드는 이 값을 포함하지 않으며 공개 스포츠 페이지를 제공합니다. Firebase 기능이 필요한 Docker 배포는 CI의 빌드 환경/안전한 빌드 구성으로 값을 주입해야 합니다. `.env`는 이미지에 복사하지 않습니다. 브라우저 전용 설정만 VITE 변수에 사용하고 서버 전용 자격증명을 넣지 마세요.

## 기존 Vercel 사이트

대상 사이트: https://ott-react-lovat.vercel.app/

`vercel.json`이 SPA 직접 접속과 `/api/sports/*`를 Vercel Node 함수로 연결합니다. 프로젝트가 이 GitHub 저장소의 `main`에 연결되어 있다면 push 후 Production 배포가 실행됩니다. 자동 배포가 꺼져 있으면 기존 프로젝트의 Deployments에서 해당 커밋을 배포하세요. Node.js 버전은 24.x입니다.

Vercel에서는 실행 인스턴스 간 메모리가 공유되지 않으므로 채팅은 Redis REST 저장소를 사용합니다. Vercel 프로젝트의 Storage에서 Upstash Redis를 연결하거나 Settings → Environment Variables에 다음 값을 **Production** 범위로 설정하고 재배포하세요.

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

기존 Vercel KV 호환 바인딩 `KV_REST_API_URL`, `KV_REST_API_TOKEN`도 지원합니다. 토큰은 브라우저용 `VITE_` 변수에 넣지 마세요. 저장소가 없으면 채팅은 설정 필요 안내를 표시하고 전송을 비활성화합니다. 코드만 배포했다고 채팅이 활성화되지는 않습니다.

SSE 연결은 Vercel 함수 실행 제한 내에서 주기적으로 재연결합니다. 접속 세션과 접속 수는 만료 시간이 있는 Redis 키로 관리하며 최근 100개 메시지는 최대 24시간 임시 보관합니다. 로그인 인증과 차단 기능은 별도 운영 요건입니다.

배포 후 확인: `/sports` 페이지 표시, `/api/sports/games`의 JSON 응답, `/api/sports/chat-status`의 `{"available":true}`, 두 브라우저의 동일 경기방 채팅 공유. 하이라이트는 실제 방송이 아니며 생중계는 아직 연결되지 않았습니다.
