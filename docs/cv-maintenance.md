# CV 관리

CV 내용은 홈페이지에서 가져옵니다. 내용을 바꿀 때는 `index.html`과 `research.html`을 수정하고, 생성 결과인 `cv.html`과 `cv.pdf`는 직접 편집하지 않습니다. 이 문서는 수정할 파일, 출력 형식, 검증과 배포 방법을 설명합니다.

## 수정할 파일

| 변경할 내용 | 파일 |
| --- | --- |
| 이름·소속·연구 관심사·연락처·학력·수상·강의·봉사·경력 | `index.html` |
| 논문 제목·저자·학회·공동 기여 표시·링크 | `research.html` |
| 홈페이지 내용 추출, HTML 구조, PDF 조판 | `scripts/generate_cv_pdf.py` |
| HTML CV의 글꼴·여백·인쇄·모바일 표시 | `scripts/cv.css` |
| Python 의존성 | `scripts/requirements-cv.txt` |
| 자동 갱신과 배포 | `.github/workflows/sync-cv.yml` |
| 누락·링크·페이지 나눔·재생성 검증 | `tests/test_cv.py` |

## 내용 반영 규칙

- 이름·직함·소속·연구 관심사는 `#home`의 `h1`, `.kicker`, `.affiliation`, `.bio`에서 가져옵니다. 이메일, 대표 홈페이지 주소, `.link-row`의 외부 프로필 링크도 포함합니다. CV 자신을 가리키는 링크는 제외합니다.
- 학력·수상·강의·봉사·경력은 `main > section.section` 안의 `article.entry`를 읽습니다. 섹션에는 `h2`, 각 항목에는 `h3`가 필요합니다. 날짜는 항목 안의 `time`에서 가져오며, reviewer처럼 본문에 연도가 이미 있는 경우 생략할 수 있습니다. `time`을 쓰면 내용은 비워두지 않습니다. 설명 문단과 목록도 포함합니다.
- 논문은 `#publications`와 `#preprints`의 `article.paper`를 읽습니다. 각 논문에는 `.venue`, `h3`, `.authors`가 필요합니다. 링크는 `.paper-links a[href]`에서 가져옵니다.
- 저자 순서, 본인 이름의 강조, 공동 기여 `*`, emergency reviewer 표시는 원문을 유지합니다. 저자에 `*`가 있으면 해당 논문 섹션 제목 옆에 `* Equal contribution`을 표시합니다.
- 항목을 날짜로 자동 정렬하지 않습니다. 홈페이지의 순서를 따르며, Publications와 Preprints를 Awards 바로 뒤에 넣습니다. 현재 순서는 Research Interests → Education → Awards → Publications → Preprints → Teaching → Services → Experience입니다.
- 새 경력 섹션도 위 형식을 따르면 자동 포함됩니다. 추가한 섹션을 제외하려면 `data-cv-exclude`를 붙입니다. 필수 섹션인 `education`, `awards`, `teaching`, `services`, `experience`는 제거하거나 제외할 수 없습니다.
- `publications`와 `preprints` 컨테이너 및 제목은 유지합니다. 논문이 없는 섹션은 CV에서 생략합니다. 두 컨테이너 밖에 놓인 `article.paper`는 누락시키지 않고 오류로 처리합니다.

Recent News, Contact 폼, 블로그 글, 게임, 프로필 사진, 논문 소개문 `.summary`는 CV에 넣지 않습니다. 연락처는 Contact 폼과 별개로 상단에 표시합니다. 사진과 논문 소개문만 바꾸면 CV 내용과 갱신 날짜는 바뀌지 않습니다.

## 문서 형식

CV는 사진 없는 학술 문서 형식입니다. 상단에 이름·소속·연락처를 배치하고, 경력 날짜는 오른쪽에 정렬합니다. 논문은 제목, 전체 저자, 학회 또는 preprint 표시, 링크 순서로 출력합니다. 링크에만 절제된 파란색을 사용합니다.

PDF는 Letter 용지와 Times 계열 글꼴을 사용하며, 본문은 10.5pt입니다. HTML도 Times 계열 세리프 글꼴을 사용합니다. 홈페이지의 공통 CSS를 바꿔도 CV 글꼴은 자동으로 바뀌지 않습니다. 두 형식을 바꾸려면 생성기의 PDF 스타일과 `scripts/cv.css`를 함께 수정합니다.

현재 내용은 PDF 2쪽으로 구성됩니다. 2쪽을 강제하지 않으므로 항목이 늘면 페이지가 추가됩니다. PDF의 섹션 제목은 첫 항목과 함께 배치하고, 한 페이지보다 긴 항목은 나누어 출력할 수 있습니다. HTML과 PDF는 같은 내용을 사용하지만 서로 다른 조판 방식이므로 줄바꿈과 인쇄 페이지 수가 완전히 같지는 않을 수 있습니다.

## 로컬 재생성과 검증

저장소 루트에서 Python 3.12로 실행합니다. `python` 명령을 찾을 수 없으면 설치된 Python 실행 파일의 경로를 사용합니다. 의존성 설치는 환경을 처음 준비하거나 요구 버전이 바뀔 때 필요합니다.

```sh
python -m pip install -r scripts/requirements-cv.txt
python -m unittest discover -s tests -p 'test_cv.py' -v
python scripts/generate_cv_pdf.py
git diff --check
```

생성기는 저장소 루트의 `cv.html`, `cv.pdf`를 갱신합니다. 별도 폴더에 미리보기만 만들려면 다음처럼 실행합니다.

```sh
python scripts/generate_cv_pdf.py --output-dir tmp/cv-preview
```

`tmp/cv-preview`는 로컬 확인용입니다. 이 폴더는 현재 `.gitignore`에 없으므로 커밋에 포함하지 않습니다.

검증할 항목은 다음과 같습니다.

1. 테스트가 모두 통과하는지 확인합니다. 원본과 출력의 제목·저자·학회·날짜·설명·링크 일치, 공동 기여와 reviewer 표시, 긴 항목의 페이지 나눔을 검사합니다.
2. PDF의 모든 페이지를 열어 잘림, 겹침, 섹션 제목만 남은 페이지 끝, 날짜 정렬을 확인합니다. 자동 테스트만으로 시각적 배치를 보장하지 않습니다.
3. `cv.html`을 넓은 화면과 좁은 화면에서 확인합니다. 인쇄본은 생성된 `cv.pdf`를 기준으로 확인합니다.
4. 변경 내역에 의도한 원본·생성기·테스트·CV 결과만 들어 있는지 확인합니다.

## 자동 갱신과 배포

`main`에 CV 관련 파일을 push하면 **Sync CV from homepage**가 실행됩니다. 로컬 수정이나 다른 브랜치의 커밋만으로는 공개 CV가 갱신되지 않습니다.

1. 원본 HTML, CV 결과, `assets/img/**`, `scripts/**`, CV 테스트 또는 워크플로 변경이 감지되면 테스트를 실행합니다. README나 이 문서만 바꾼 경우에는 CV 갱신을 실행하지 않습니다.
2. 테스트가 통과하면 최신 `main`에서 CV를 다시 생성합니다. 결과가 달라졌을 때만 `cv.html`, `cv.pdf`를 `Update CV from homepage` 커밋으로 올립니다.
3. 워크플로는 기존 브랜치 기반 GitHub Pages의 재빌드를 명시적으로 요청합니다. 생성 커밋 여부와 별개로 재빌드 요청을 수행합니다.
4. Actions 실행 결과와 공개 CV를 모두 확인합니다. 워크플로 성공과 공개 사이트 반영 완료를 같은 것으로 취급하지 않습니다.

Pull request에서는 테스트만 실행하고 자동 커밋이나 배포는 하지 않습니다. Actions에서 수동으로 실행할 때는 `main`을 선택해야 동기화 단계도 실행됩니다.

Pages 설정은 `main` 브랜치의 루트를 사용합니다. 저장소 정책이 Actions의 `contents: write`, `pages: write` 권한과 `main` 직접 커밋을 허용해야 합니다. 워크플로는 GitHub가 제공하는 토큰을 사용하므로 별도 비밀번호나 개인 액세스 토큰을 문서나 코드에 넣지 않습니다.

자동 생성 커밋 뒤에 작업을 이어갈 때는 작업 중인 변경을 보존한 후 원격 `main`을 가져옵니다. 현재 브랜치에서 fast-forward가 가능한 경우 다음 명령으로 반영합니다.

```sh
git fetch origin main
git merge --ff-only origin/main
```

Fast-forward가 불가능하면 서로 다른 변경이 있는지 먼저 확인합니다. 생성 파일을 덮어쓰려고 강제 push나 작업 내용 초기화를 하지 않습니다.

## 갱신 날짜와 오류 확인

`cv.html`에는 내용 식별값 `cv-source-sha256`과 갱신 날짜 `cv-updated`가 들어갑니다. 식별값은 CV에 포함되는 내용, 생성기, CV CSS, 의존성 목록으로 계산합니다. 이것이 같으면 기존 날짜를 유지합니다. 바뀌면 재생성 시점의 한국 표준시 날짜를 사용합니다. 같은 환경에서 같은 입력과 날짜로 재생성한 PDF는 동일한 결과를 내도록 설정되어 있습니다.

| 증상 | 확인할 부분 |
| --- | --- |
| `Missing CV source field` 또는 `Missing homepage CV section` | 원본 HTML의 필수 선택자, 제목, 날짜, 저자와 섹션이 남아 있는지 확인합니다. |
| `Found papers outside Publications/Preprints` | 논문 항목을 두 논문 섹션 중 맞는 곳으로 옮깁니다. |
| `Unsupported link in CV source` | CV에 포함되는 링크가 `http`, `https`, `mailto` 중 하나인지 확인합니다. |
| Python 모듈을 찾을 수 없음 | 생성에 사용하는 Python과 같은 실행 파일로 의존성을 설치했는지 확인합니다. |
| 로컬 CV는 바뀌었지만 공개 CV는 그대로임 | `main` 반영 여부, CV 워크플로, Pages 배포 결과를 순서대로 확인합니다. |
| 자동 커밋 또는 Pages 재빌드 요청 실패 | 워크플로 로그와 저장소 권한·브랜치 보호 설정을 확인합니다. |
| PDF에서 글이 잘리거나 제목이 따로 남음 | 테스트 후 전체 페이지를 다시 확인하고 PDF 조판을 수정합니다. HTML CSS만 고쳐서는 PDF가 바뀌지 않습니다. |

필수 필드 누락처럼 원본 검증이 실패하면 기존 CV 결과를 교체하기 전에 중단합니다. 오류를 없애려고 검증을 제거하지 말고 원본 구조를 고친 뒤 재생성합니다.
