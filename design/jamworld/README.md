# 입체 탐험가 보행

`iso-avatar-walk-v2-source.png`는 기존 `public/jamworld/assets/atlas/iso-avatar.webp`의 인물 디자인을 참조해 Codex의 `imagegen` 도구로 만든 원본이다. 대기와 네 가지 보행 자세를 8방향으로 배치한다.

Functions 빌드 후 `node scripts/jamworld/build-walk-atlas.cjs`를 실행하면 공방 인물과 같은 정규화로 128×160px 프레임 40개와 `iso-avatar.json`을 만든다. 정면 행은 원본의 두 번째 걷기 그림이 반대 발 접지에 해당하므로 메타데이터에서 재생 순서를 조정한다. 원본 그림의 픽셀을 수정하지 않는다.

이전 메타데이터는 `iso-avatar-v1.json`이며 기존 WebP도 유지한다. 실행 중 사용하는 새 그림은 `public/jamworld/assets/atlas/iso-avatar-walk-v2.png`이다. 추가 생성 시 원본 인물의 외형과 방향, 좌우 발 교대는 실제 걷기 화면에서 확인한다.

`terrain-v2-preview.png`는 2026-10-22 배포된 기본 바닥 재질의 실제 브라우저 화면이다. 바닥은 이미지 생성물 대신 `src/features/jamworld/lib/render/terrain.ts`의 Canvas 도형과 그라데이션으로 그린다.
