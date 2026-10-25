# 헤드셋 러너 방향 보정

내장 imagegen으로 기존 공개 에셋의 방향을 보정했다. 원본: [headset-runner-direction-source-v3.png](./headset-runner-direction-source-v3.png).

정면, 앞쪽 오른쪽 대각선, 오른쪽 옆면, 뒤쪽 오른쪽 대각선, 뒷면의 다섯 기준 방향을 생성한다. 왼쪽 세 방향은 각 걷기 프레임을 제자리 반전해서 만든다. 전체 줄을 반전하면 동작 순서가 거꾸로 되므로 프레임별로 처리한다. 두 시점 모두 같은 캐릭터와 정면·뒷면을 유지한다.

## 사용한 프롬프트

Use case: precise-object-edit / identity-preserve. Asset type: production game character sprite sheet correction.
Input image 1 is the EDIT TARGET, the existing Headset Runner character sheet. Input image 2 is supporting design reference of that exact same character. Fix incorrect facing angles while preserving his exact brown spiky hair, turquoise-and-cream over-ear headphones, navy sunglasses, turquoise runner singlet with yellow stripe, matching shorts, yellow wristbands and teal/yellow running shoes, skin tone, bold dark outline and cel-shaded illustration style. Do not redesign the character.
Create ONE corrected CANONICAL DIRECTION sprite sheet on a genuinely transparent canvas, square, with EXACTLY FIVE equally spaced rows and EXACTLY FIVE equally spaced columns: 25 isolated full-body figures, 1 per cell. No labels or grid. All 25 figures same body/head scale and a consistent standing foot baseline. Generous empty transparent spacing around each figure. Feet and hair must never touch adjacent cells.
The FIVE ROWS, top to bottom, are SCREEN directions:
ROW 1: directly DOWN toward viewer, true symmetric full FRONT face and chest, BOTH headphone earcups equally visible, nose centered. Absolutely NO profile or sideways angle in ANY column.
ROW 2: diagonally DOWN-RIGHT, front-right three-quarter view, facing bottom-right of the screen.
ROW 3: directly RIGHT, exact RIGHT PROFILE facing right edge of image, nose points right, no frontal view.
ROW 4: diagonally UP-RIGHT, rear-right three-quarter view, facing top-right of the screen, most of his back visible and only a tiny cheek at right.
ROW 5: directly UP away from viewer, true full BACK view, centered back of head and back of shirt, NO sunglasses, NO face or nose visible in ANY column.
No left-facing rows are needed; the game derives left directions by mirroring these right directions. The head, torso and gaze must maintain the SAME exact row direction through all FIVE columns; only arms and legs move. This is the most important correction.
COLUMNS 0 through 4: idle standing, left-foot-forward contact, left-leg supporting while right knee passes, right-foot-forward opposite contact, right-leg supporting while left knee passes. Natural short walking strides (not running or jumping), gentle knee bend, opposite arm swing, one foot always grounded. Four distinct walking poses in forward sequence, no duplicated contact poses. Never rotate the body toward the direction of a swinging leg.
Transparent alpha background, no checkerboard, no text, no shadows, no floor, no scene. Clean sharp game art readable at small size. Preserve character identity exactly.
