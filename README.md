# Jongwon Lim GitHub Pages

Jongwon Lim 개인 연구자 홈페이지용 정적 GitHub Pages 템플릿입니다. 별도 빌드 과정 없이 `index.html`을 바로 배포할 수 있습니다.

## CV 자동 갱신

[CV 관리 문서](docs/cv-maintenance.md)에 원본 구조, 문서 형식, 재생성·검증·배포 절차와 오류 확인 방법을 정리했습니다.

- CV의 원본은 홈페이지입니다. `index.html`의 자기소개·학력·수상·강의·봉사·경력과 `research.html`의 Publications/Preprints를 수정하세요.
- `main`에 반영하면 **Sync CV from homepage**가 `cv.html`, `cv.pdf`를 재생성해 커밋하고 GitHub Pages 재배포를 요청합니다. 로컬에서 수정만 한 내용은 아직 공개 CV에 반영되지 않습니다.
- 기존 **Settings → Pages → Deploy from a branch → main / (root)** 설정을 유지합니다. 추가 비밀번호나 개인 액세스 토큰은 필요하지 않습니다. 저장소 정책에서 Actions의 `contents: write`, `pages: write` 및 main 직접 커밋이 허용되어야 합니다.
- 자동 커밋은 일반 push처럼 Pages 배포를 유발하지 않으므로 [Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)를 명시적으로 호출합니다. 최초 push 후 Actions에서 성공 여부를 확인하세요.
- CV에 넣지 않는 항목: Recent News, Contact 폼, 블로그 글, 게임. 본문 내용이 같으면 갱신 날짜와 PDF도 바뀌지 않습니다.
- 새 경력 항목은 기존 `article.entry` 형식, 새 논문은 기존 `article.paper` 형식을 복사하세요. 저자 `*`, 게재 학회, 링크, emergency reviewer 문구도 그대로 반영됩니다. 새 경력 섹션도 자동 포함되며, 제외하려면 섹션에 `data-cv-exclude`를 붙입니다. 필수 섹션/필드가 없어지면 누락된 CV를 덮어쓰지 않고 검증이 실패합니다.
- `cv.html`, `cv.pdf`는 생성 결과이므로 직접 수정하지 마세요. 레이아웃은 `scripts/cv.css`(HTML)와 `scripts/generate_cv_pdf.py`(PDF)에서 관리합니다.
- CV는 사진 없이 세리프 글꼴, 오른쪽 날짜 정렬, 논문 서지정보 중심의 인쇄용 형식으로 생성됩니다. 홈페이지의 논문 소개문은 CV에 싣지 않지만 제목·전체 저자·공동 기여 표시·학회·링크는 유지합니다. 섹션 제목은 첫 항목과 함께 배치하며, 분량이 늘면 자동으로 다음 페이지로 이어집니다.

로컬에서 바로 재생성 및 검증:

```sh
python -m pip install -r scripts/requirements-cv.txt
python scripts/generate_cv_pdf.py
python -m unittest discover -s tests -p 'test_cv.py' -v
```

자동 갱신 커밋 이후 로컬 작업을 이어갈 때는 먼저 `git pull --ff-only`로 생성된 CV를 가져오세요.

## 블로그 본문 편집

- Write 화면에서 문단과 수식을 직접 편집합니다. `▸ Toggle`을 누르거나 빈 문단에서 `/toggle` 뒤에 Space를 입력하면 접기 블록이 생깁니다.
- Split은 왼쪽에 순수 Markdown 원문, 오른쪽에 실시간 미리보기를 표시합니다. 수식·각주·접기 문법을 원문 그대로 편집하며 자동 저장됩니다. Write는 리치 편집기입니다. 좁은 화면에서는 미리보기가 원문 아래에 표시됩니다.
- 본문 아래 손잡이를 드래그하면 높이, Split 가운데 구분선을 드래그하면 좌우 비율을 바꿀 수 있습니다. Editor size에서 전체 너비·높이를 조절하거나 초기화합니다. 손잡이에는 방향키도 사용할 수 있고, 크기 설정은 이 브라우저에 저장됩니다.
- 제목을 입력하고 Enter를 누르면 안쪽 내용을 쓸 수 있습니다. 화살표로 접고 펼치며, 토글 안에 토글도 넣을 수 있습니다. `↳`는 토글 밖으로 이어 쓰기, `⇤`는 내용은 유지하고 토글만 해제하기입니다.
- Equation에서 템플릿을 넣거나 `$...$`를 입력합니다. Write에서는 LaTeX 원문을 본문에서 바로 수정·선택·복사하고, Preview와 게시글에서는 수식으로 표시합니다. 별도 수식 편집창은 없습니다. Ctrl/Cmd+Enter로 수식 뒤에 이어 쓸 수 있습니다. 본문을 복사하면 Markdown과 LaTeX가 함께 보존됩니다.
- Footnote를 눌러 커서 위치에 각주를 넣습니다. 작성 중 위첨자 번호를 클릭하면 내용을 수정하거나 참조를 제거할 수 있습니다. 번호는 본문 등장 순서대로 갱신됩니다. 글에서는 번호로 각주로 이동하고 `↩`로 본문에 돌아옵니다. 각주에도 Markdown 링크와 LaTeX 수식을 쓸 수 있습니다.
- 각주의 Markdown 형식은 `문장[^note]`와 별도 줄의 `[^note]: 설명`입니다. 여러 줄의 설명은 후속 줄을 네 칸 들여쓰기합니다. 같은 ID를 재사용하면 하나의 각주를 여러 곳에서 참조합니다. 정의가 없는 참조는 원문으로 남으며, 사용하지 않은 정의도 편집 및 저장 과정에서 보존됩니다.
- 초안은 이 브라우저에 자동 저장됩니다. Publish/Save changes를 눌러야 서버에 반영됩니다. 기존 글은 Markdown으로 유지하며 DB 변경이 없습니다. 새로 열 때 토글은 접힌 상태로 시작합니다.
- Markdown에서 토글은 `:::toggle 제목`, 빈 줄, 본문, 빈 줄, `:::` 형식입니다. 중첩할 때 바깥쪽의 콜론을 더 많이 사용합니다.

편집기 소스 변경 시 번들과 라이선스를 재생성하고 함께 커밋합니다. 배포 서버에는 Node가 필요 없습니다.

```sh
pnpm install --frozen-lockfile
pnpm build:editor
pnpm test
```

`node tests/preview-editor.mjs`는 `http://127.0.0.1:4174/blog.html#write`에서 테스트용 글로 UI를 확인하는 로컬 미리보기입니다. 실제 인증/게시 요청은 차단하며, `/mobile`은 모바일 너비 확인용입니다.

## 포함 파일

```text
.
├── index.html
├── README.md
├── .nojekyll
└── assets
    ├── css/styles.css
    ├── js/main.js
    └── img/
        ├── favicon.svg
        ├── jl-avatar.svg
        ├── value-paper-preview.jpg
        └── value-paper-preview.webp
```

## 배포 방법

1. GitHub에서 `USERNAME.github.io` 형식의 repository를 만듭니다.
2. 이 폴더의 파일들을 repository 최상위에 업로드합니다.
3. repository의 **Settings → Pages**에서 branch를 `main` / root로 설정합니다.
4. 몇 분 후 `https://USERNAME.github.io`에서 페이지를 확인합니다.

## 수정하면 좋은 부분

- `index.html`의 자기소개 문단을 더 개인적인 연구 statement로 확장
- 실제 프로필 사진이 있다면 `assets/img/profile.jpg`를 추가한 뒤, `index.html`의 `jl-avatar.svg` 경로를 교체
- 논문 OpenReview / PDF / project page 링크가 확정되면 publication card의 버튼 추가
- 이메일을 공개할 계획이면 Contact section에 `mailto:` 링크 추가

## 디자인 특징

- 반응형 single-page academic homepage
- 다크/라이트 모드 토글
- Google Scholar, LinkedIn, Lab page 연결
- publication preview image 포함
- GitHub Pages에서 바로 동작하는 plain HTML/CSS/JS 구조
