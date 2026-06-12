import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata = {
  title: "이용약관 · 러닝크루",
  description: "러닝크루 서비스 이용약관",
};

const UPDATED = "2026년 5월 30일";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <header className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--md-sys-color-primary)] hover:underline"
        >
          <Icon name="arrow_back" size={16} />
          돌아가기
        </Link>
        <h1 className="text-3xl font-black text-[var(--md-sys-color-on-surface)]">
          이용약관
        </h1>
        <p className="mt-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          최종 개정일: {UPDATED}
        </p>
      </header>

      <div className="flex flex-col gap-7 text-[15px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
        <section>
          <h2 className="mb-2 text-lg font-extrabold">제1조 (목적)</h2>
          <p>
            이 약관은 ‘러닝크루’(이하 “서비스”)를 운영자가 제공하고 이용자가
            이용함에 있어, 서비스 이용과 관련한 운영자와 이용자의 권리·의무 및
            책임사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">제2조 (정의)</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>서비스</b>: 교사가 학급을 만들고 학생이 참여하여 학습 활동·게임·
              지식맵 등을 함께 수행하는 학습 관리(LMS) 웹 서비스를 말합니다.
            </li>
            <li>
              <b>교사 이용자</b>: Google 계정으로 로그인하여 학급을 개설·운영하는
              이용자를 말합니다.
            </li>
            <li>
              <b>학생 이용자</b>: 교사가 안내한 학급 초대 코드 등으로 참여하는
              이용자를 말합니다.
            </li>
            <li>
              <b>콘텐츠</b>: 이용자가 서비스에 입력·제출·업로드한 글, 단어, 사진,
              음성, 게임 기록 등 일체의 자료를 말합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">제3조 (서비스의 내용)</h2>
          <p className="mb-2">서비스는 다음 기능을 제공합니다.</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>차시·활동 구성, 질문·문항·설문·성찰 등 학습 활동</li>
            <li>개념 빙고 등 학급 참여형 게임</li>
            <li>학생 응답·개념을 분석한 지식맵·워드클라우드 등 시각화</li>
            <li>인공지능(AI)을 활용한 개념 추출·요약·학습 피드백</li>
            <li>학습 격려를 위한 칭찬·미션·레벨 등 보조 기능</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제4조 (이용자 자격)
          </h2>
          <p>
            서비스는 학교 수업 활동을 지원하기 위한 도구로, 학생 이용자는 교사 등
            보호·관리 책임이 있는 교육자의 지도와 학교의 관리 아래 이용하는 것을
            전제로 합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제5조 (계정과 학급 참여)
          </h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>교사 이용자는 Google 계정 인증을 통해 가입·로그인합니다.</li>
            <li>
              학생 이용자는 교사가 안내한 학급 초대 코드 등으로 참여하며, 표시
              이름 등 최소한의 정보로 활동합니다.
            </li>
            <li>
              이용자는 계정과 학급 정보를 타인과 부정하게 공유해서는 안 되며, 관리
              소홀로 발생한 결과에 대한 책임은 이용자에게 있습니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제6조 (이용자의 의무·금지행위)
          </h2>
          <p className="mb-2">이용자는 다음 행위를 해서는 안 됩니다.</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>타인의 저작권·초상권·개인정보 등 권리를 침해하는 행위</li>
            <li>욕설·비방·차별·혐오 등 타인에게 불쾌감을 주는 콘텐츠 게시</li>
            <li>음란·폭력 등 교육 목적에 어긋나는 콘텐츠 게시</li>
            <li>서비스의 정상 운영을 방해하거나 자동화된 과도한 요청을 보내는 행위</li>
            <li>타인의 계정·학급에 부정하게 접근하거나 정보를 도용하는 행위</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">제7조 (콘텐츠의 권리)</h2>
          <p className="mb-2">
            이용자가 작성한 콘텐츠의 권리는 해당 이용자(또는 소속 학교)에게
            있습니다. 다만 운영자는 서비스 제공·운영·개선(예: 화면 표시, 지식맵
            생성, 백업)에 필요한 범위에서 콘텐츠를 이용할 수 있습니다.
          </p>
          <p>
            운영자는 제6조를 위반한 콘텐츠를 사전 통지 없이 삭제하거나 노출을
            제한할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제8조 (인공지능 기능에 관한 고지)
          </h2>
          <p className="mb-2">
            서비스는 개념 추출·요약·학습 피드백·의미 기반 지식맵 등을 위해
            인공지능(AI) 기술을 사용합니다. 이를 위해 이용자가 입력한 학습
            데이터의 일부(예: 제출한 단어·문장)가 분석 및 처리될 수 있습니다.
          </p>
          <p>
            AI가 생성한 분석·피드백은 학습 보조를 위한 참고 자료이며, 항상 정확함을
            보장하지 않습니다. 교육적 판단의 최종 책임은 교사·이용자에게 있습니다.
            자세한 처리 내용은{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[var(--md-sys-color-primary)] hover:underline"
            >
              개인정보 처리방침
            </Link>
            을 참고하세요.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">제9조 (면책)</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              운영자는 천재지변, 외부 인프라(클라우드·네트워크 등) 장애 등
              불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.
            </li>
            <li>
              운영자는 이용자가 게시한 콘텐츠의 정확성·적법성에 대해 책임을 지지
              않으며, 이용자 간 또는 이용자와 제3자 간 분쟁에 개입하지 않습니다.
            </li>
            <li>
              본 서비스는 무료로 제공되는 교육용 도구로서, 운영자는 관계 법령이
              허용하는 범위에서 책임을 부담합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제10조 (서비스의 변경·중단)
          </h2>
          <p>
            운영자는 서비스의 전부 또는 일부를 운영상·기술상 필요에 따라 변경하거나
            중단할 수 있으며, 중요한 변경은 가능한 범위에서 사전에 공지합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">제11조 (약관의 변경)</h2>
          <p>
            이 약관은 관련 법령이나 운영 정책에 따라 변경될 수 있으며, 변경 시
            개정일과 함께 서비스 내에 공지합니다. 변경된 약관은 공지된 시점부터
            효력이 발생합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">제12조 (문의처)</h2>
          <p>
            서비스 이용과 약관에 관한 문의는 아래로 연락해 주세요.
            <br />
            이메일:{" "}
            <a
              href="mailto:jammanbogem@gmail.com"
              className="font-semibold text-[var(--md-sys-color-primary)] hover:underline"
            >
              jammanbogem@gmail.com
            </a>
          </p>
        </section>

        <p className="mt-4 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          본 약관은 교육 현장의 합리적 이용을 위한 기본 문서로, 법률 자문을 거친
          정식 문서가 아닐 수 있습니다. 정식 운영 시에는 관련 법령 및 전문가 검토를
          권장합니다.
        </p>
      </div>

      <footer className="mt-10 flex gap-4 border-t border-[var(--md-sys-color-outline-variant)] pt-6 text-sm">
        <Link
          href="/privacy"
          className="font-semibold text-[var(--md-sys-color-primary)] hover:underline"
        >
          개인정보 처리방침
        </Link>
        <Link
          href="/"
          className="font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:underline"
        >
          홈으로
        </Link>
      </footer>
    </main>
  );
}
