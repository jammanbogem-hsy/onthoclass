# 에셋 제작 가이드 (3D·소리·목소리)

출처: 공유 구글 문서 「AI 3D/ TTS 생성/무료사운드 사이트 공유」의 모든 탭을 정리하고, 이 저장소에서 실제로 쓰는 방식(잼만보 낚시터 `games/fish`)을 덧붙였다.
문서에 있던 계정·비밀번호·추천 계정 목록은 **일부러 옮기지 않았다**. 필요하면 원문을 직접 본다.

---

## 1. 3D 모델 생성 — 원칙

| 원칙 | 이유 / 출처 |
| --- | --- |
| **이미지 → 3D가 텍스트 → 3D보다 낫다.** 가능하면 참고 이미지(정면, 가능하면 앞·뒤·좌·우 4장)를 먼저 만들고 3D로 | 문서: "루마 빼고 image to 3d 쓸만함, text to 3d는 아직 아쉬움", "ChatGPT 등으로 멀티뷰(앞/뒤/좌/우) 이미지 생성 → Tripo 업로드" |
| 서비스마다 잘 뽑는 대상이 다르다 → 안 되면 다른 서비스도 돌려 본다 | 문서 [3D 모델링] AI 사이트 공유 |
| 생성 직후 **바로 다운로드**(Tripo 보관: 무료 1일, 유료 7일) | Tripo 탭 |
| 유료 오브젝트·그림을 캡처해 참고 이미지로 다시 생성하는 것도 방법 (Sketchfab·Fab·CGTrader 검색 → 참고) | Tripo 꿀팁 |
| 라이선스: Tripo 무료 플랜 = CC BY 4.0(출처 표기 필수), 유료 플랜 = 표기 불필요 | Tripo 라이선스 |

### Tripo 프롬프트·설정 체크리스트

- 형식 **GLB**, 텍스처 **1K**(실패하면 512). 낚시터는 몸 1024 / 소품 512로 다시 줄인다.
- 리깅할 캐릭터: **T/A 포즈**, 팔을 몸에서 떼고, 한 덩어리 메시.
- 프롬프트에 붙일 말: `single clean mesh, no floating parts, no internal geometry, neutral pose, full body, front view, no base`
- 손에 막대·도구가 붙어 나오면 negative에 `holding object, stick, rod, pole, tool, base, pedestal, text`.
- 바닥 가운데 피벗(bottom-center pivot) 켜도 됨.

### Tripo CLI (`npm i -g tripo-cli`)

- **API 크레딧**으로 동작한다(Studio 웹 구독 크레딧과 별개). 키는 `.env.tripo`의 `TRIPO_API_KEY`(절대 출력·커밋 금지).
- 모델: `tripo-v3.1`(기본, 고품질) · `tripo-p2`(게임용·쿼드, 100~130크레딧) · `tripo-p1`(저가).
- 이미지 파이프라인(문서 권장 흐름):
  ```bash
  tripo generate image-to-image ref.png --prompt "...front view, A-pose..."   # 참고 사진 → 정면 원화
  tripo generate image-to-multiview @last                                      # 4방향 시트
  tripo generate multiview-to-model @last -p geometry_quality=detailed          # 3D
  ```
- 비용 확인: `--dry-run --json`, 잔액: `tripo balance`.
- 다른 3D 생성기: Rodin(Hyper3D, 그림 업로드 좋음), Meshy, Hitem3D, YVO3D(무료도 상업 라이선스), 3D AI Studio, Krea, VRIN.

## 2. 리깅·애니메이션

- 자동 리깅: Mixamo(FBX/OBJ/ZIP만, Tripo에서 **FBX로 다시 받아** 올리기), Mesh2Motion(GLB), AccuRig, Anything World, Blender + Auto-Rig Pro, Rokoko.
- 믹사모 오류 잡기
  - 크기를 사람 크기(170~180cm)로 키우고 Blender `Ctrl+A → All Transforms`로 스케일 1.0.
  - 정면은 -Y.
  - 메시는 하나로 Join, 구멍(발바닥·목) 메우기, 법선 뒤집힘 확인.
  - 팔다리가 짧은 SD 캐릭터: Skeleton LOD를 **No Fingers(25)**, Symmetry 끄기, 마커를 관절보다 조금 바깥으로(무릎은 가랑이와 발 사이 정중앙, 턱은 목 쪽).
  - 그래도 안 되면 리깅용으로만 팔다리를 늘린 모델로 리깅 → 엔진에서 뼈 길이를 되돌린다.
- 낚시터 `games/fish`는 리깅 없이 **셰이더로 몸을 휜다**(물고기). 사람은 낚싯대를 쥔 자세(두 주먹을 가슴 앞)로 생성해서 그대로 쓴다.

### 동작 다듬기 체크(문서의 Blender 애니메이션 프롬프트 요약)

준비 동작 → 본동작 → 마무리 / 체중 이동(골반·상체 중심) / 관절이 이어서 움직이기 / 시선이 먼저 대상으로 / 손 접촉 위치 맞추기 / 발 미끄러짐·뜸 없애기 / 부딪힘·착지 반응 / 여러 시점에서 관통 확인. 원본은 보존.

### 배경 다듬기 체크(문서의 Blender 배경 프롬프트 요약)

형태와 비율 → 세부(손잡이·틈·테두리) → 재질(나무·금속·유리·천 구분) → 조명 방향과 그림자 → 겹침·뜸 점검 → 이름 정리. 실시간용이면 "성능을 고려해" 줄인다.

## 3. 확인·조명 도구

- GLB 빠른 보기: 3dviewer.net, modelviewer.dev/editor(HDR·노출·그림자), Sketchfab(Edit 3D Settings → Lighting).
- 저장소 안: `games/fish` 점검 스크립트(아바타는 avcheck, 썸네일은 thumbs)로 여러 각도 스크린샷을 찍어 눈으로 확인한다.

## 4. 에셋 내려받기

- 3D: Sketchfab, Fab(Quixel), Unity Asset Store.
- 한국 문화유산 3D: 국립중앙박물관, 국가유산 3D(digital.khs.go.kr), Sketchfab KHS_Asset, 공공데이터포털, 한국학중앙연구원 디지털인문학(dh.aks.ac.kr).

## 5. 소리

| 용도 | 곳 | 메모 |
| --- | --- | --- |
| 효과음 생성 | ElevenLabs Sound Effects | 저장소 키는 `.env.elevenlabs`(출력 금지) |
| 실제 녹음 효과음 | freesound.org | 라이선스 곡마다 확인 |
| BGM | Pixabay Music, Mixkit(표기 불필요), YouTube 오디오 라이브러리, Free Music Archive, Bensound(표기), Incompetech(CC) | |
| 공공 | 공유마당(gongu.copyright.or.kr) | |
| 음악 생성 | SUNO | |
| 간단 자르기 | vocalremover.org/ko/cutter | |

## 6. 목소리(TTS)

- Google AI Studio → Generate speech: **Leda = 여자아이, Laomedea = 남자아이**, Puck 남성, Kore 여성. Flash preview가 빠르다.
- ElevenLabs(감정 표현), Supertone(감정 표현, 비쌈), TTSMaker(설명용, 저렴), Typecast, 클로바더빙.
- 문장 팁
  - 괄호는 잘못 읽는다. 띄어쓰기로 풀어 쓴다.
  - 단위는 한글로 쓴다(cm → 센티미터).
  - 쉼표를 넣어야 쉰다.

## 7. 2D·UI·영상

- 배경 지우기: remove.bg, Kaleido, Pixlr, Photopea(웹 포토샵).
- 업스케일: Magnific, imgupscaler, upscale.media, imglarger.
- 이미지 다시 그리기: Leonardo(Legacy Mode → 이미지 업로드 → Strength). 정책에 걸리면 "정책 위반 안 되게, 사실적으로 다시 그려줘".
- 영상: Sora, Kling, Hailuo, Vidu, Grok Imagine, Seedance. 편집은 Canva.
- 영상 흐름: 기획(GPT/Gemini) → 컷 이미지(Sora·나노바나나·Mixboard) → 영상 → 편집.

## 8. 호스팅이 느릴 때 (문서의 점검 순서)

1. **진단:** 첫 화면까지 오래 걸리는 원인을 찾는다. 네트워크·파일 크기·서버·렌더링·이미지/3D/스크립트를 보고, 확인한 사실과 추정을 나눈다.
2. **개선:** 첫 화면에 필요한 것부터 불러오고 나머지는 지연 로드한다. 압축(메시 meshopt, 텍스처 webp), 중복 요청 제거, 캐시와 버전 쿼리(`?v=`)를 챙긴다.
3. **검증:** 같은 조건에서 전후를 비교하고, 확인하지 못한 것은 확인 못 했다고 적는다.

---

## 잼만보 낚시터에 적용한 방식

- **물고기**
  - Tripo text→3D, `face_limit 6000`, 후보 2개 중 고른다.
  - 스타일 문구 `cute stylized cartoon game asset, smooth toy-like shapes, vivid colors, full body side view, single object, no base`
  - `opt.sh`로 weld → simplify → webp → meshopt 처리.
  - `models.json`에 yaw(머리 방향)를 적는다.
- **사람(바탕 몸)**
  - 반팔·반바지를 입히고, 두 주먹을 가슴 앞에 모은 자세로 만든다.
  - 비옷·조끼·장화는 몸 겉면을 잘라 부풀린 껍데기다(`avatar.js`). 몸 비율이 바뀌면 `analyze`·`cut`의 높이 기준(키 H 대비)을 다시 맞춘다.
- **모자 ↔ 머리 맞춤 (모든 머리 아이템·캐릭터에 적용)**
  - 게임은 모자 안쪽 공간을 광선으로 재서(`hatCavity`) 아랫단보다 위의 머리를 그 안으로 끌어당긴다. 그래서 **모자는 안쪽이 머리를 품을 만큼 깊어야** 한다.
    - 모자 생성 프롬프트: `deep crown that fully covers the top of the head down to the forehead, hollow inside, opening is a round/oval hole, worn on a child's head`. 얕은 접시형(해적 삼각모처럼)은 머리 위에 얹혀 보인다.
    - 장식(방울·리본·챙)은 바깥에만. 안쪽에 막대·받침 금지.
  - 캐릭터(바탕 몸)의 머리는 **모자가 덮을 높이 위로 부피가 크지 않게**:
    - 포니테일·묶음은 정수리가 아니라 **뒤통수 아래(목덜미 쪽)** 에서 내려오게. 아랫단 아래로 늘어진 머리는 그대로 보인다.
    - 삐친 머리·더듬이 머리 금지, 머리카락은 두피에서 2~3cm 안쪽.
    - 프롬프트: `hair close to the scalp, low ponytail at the nape, no tall hair buns`.
  - 새 모자·새 캐릭터를 넣으면 앞·옆·뒤·¾ 네 방향 머리 확대샷으로 확인한다(남녀 × 모든 모자). 머리카락이 모자 겉면에 점처럼 뚫고 나오면 실패.
- **미니게임 그림은 도트**: 미니게임 화면은 픽셀 UI라 물고기도 도트다. 3D 모델을 찍은 그림(`assets/minigames/fish/*.webp`)을 게임이 가로 24칸(캔버스용 12칸)으로 줄이고 7단계 색 + 남색(#13162e) 테두리로 바꿔 쓴다(`pixelFish`). 매끈한 고해상도 그림을 미니게임에 그대로 넣지 않는다.
- **크롬북 예산**
  - 몸: 2만 삼각형, 텍스처 1024.
  - 소품: 512.
  - 한 화면 그리기 50번 안팎.
