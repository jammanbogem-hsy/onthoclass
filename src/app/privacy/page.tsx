import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata = {
  title: "개인정보 처리방침 · 러닝크루",
  description: "러닝크루 개인정보 처리방침",
};

const UPDATED = "2026년 5월 31일";

export default function PrivacyPage() {
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
          개인정보 처리방침
        </h1>
        <p className="mt-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          시행일: {UPDATED}
        </p>
      </header>

      <div className="flex flex-col gap-7 text-[15px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
        <section>
          <p>
            러닝크루(이하 “본 서비스”)는 「개인정보 보호법」 제30조에 따라
            정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게
            처리할 수 있도록 하기 위하여 다음과 같이 개인정보 처리방침을
            수립·공개합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제1조 (개인정보의 처리 목적)
          </h2>
          <p className="mb-2">
            본 서비스는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하는
            개인정보는 다음의 목적 이외의 용도로는 이용하지 않으며, 이용 목적이
            변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는
            등 필요한 조치를 이행합니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>학급 구성원 식별 및 관리, 교사의 학습 피드백 제공</li>
            <li>
              서비스 제공: 학습 활동·과제 제출 및 기록 저장, 게임·지식맵 등 학습
              이력 관리
            </li>
            <li>인공지능을 활용한 학습 분석·요약·피드백 제공</li>
            <li>서비스 개선, 오류 진단 및 이용자 문의·피드백 처리</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제2조 (처리하는 개인정보 항목)
          </h2>
          <p className="mb-2">
            본 서비스는 학습 지원을 위해 필요한 최소한의 개인정보만을 수집합니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>교사</b>: Google 계정 로그인 시 제공되는 이름, 이메일, 프로필
              이미지, 계정 식별자
            </li>
            <li>
              <b>학생</b>: 학급 참여 시의 표시 이름(또는 닉네임) 등 최소 정보
            </li>
            <li>
              <b>학습 활동 정보</b>: 제출한 글·단어·답안, 설문·성찰 응답, 게임 참여·
              기록, 칭찬·미션 등 활동 데이터
            </li>
            <li>
              <b>첨부 파일</b>: 이용자가 업로드한 사진·음성 등
            </li>
            <li>
              <b>서비스 이용 정보</b>: 접속 시각, 기기·브라우저 정보(오류 진단·
              피드백 처리 목적)
            </li>
          </ul>
          <p className="mt-2">
            <b>수집하지 않는 항목</b>: 주민등록번호, 주소, 전화번호 등 불필요한
            민감 정보는 수집하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제3조 (개인정보의 처리 및 보유기간)
          </h2>
          <p className="mb-2">
            본 서비스는 법령에 따른 보유·이용기간 또는 정보주체로부터 동의받은
            보유·이용기간 내에서 개인정보를 처리·보유합니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              학급·회원 정보: 학급 운영 목적이 달성되거나 회원 탈퇴 또는 삭제 요청
              시까지
            </li>
            <li>
              학습 활동 데이터: 교사가 해당 학급·활동을 삭제하면 관련 데이터가
              함께 삭제됩니다.
            </li>
            <li>관련 법령에서 보관을 요구하는 경우 해당 기간 동안 보관합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제4조 (학생 개인정보의 보호)
          </h2>
          <p>
            본 서비스는 학교 수업을 지원하는 도구로, 학생의 참여는 교사·학교의
            관리 아래 이루어집니다. 학생에게서는 표시 이름과 학습 활동 등 수업에
            필요한 최소한의 정보만 수집하며, 운영자는 학생의 직접 식별정보 수집을
            최소화하도록 설계하였습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제5조 (인공지능 기능에 관한 사항)
          </h2>
          <p className="mb-2">
            본 서비스는 개념 추출·요약·학습 피드백·의미 기반 지식맵 생성을 위해
            인공지능(AI) 기술을 사용하며, 이를 위해 이용자가 입력한 학습 데이터의
            일부(예: 제출한 단어·문장)가 분석 및 처리될 수 있습니다.
          </p>
          <p>
            분석에 사용되는 데이터는 필요한 학습 내용으로 한정하며, 가능한 범위에서
            직접 식별정보를 포함하지 않도록 합니다. AI가 생성한 분석·피드백은 학습
            보조를 위한 참고 자료이며 항상 정확함을 보장하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제6조 (개인정보의 파기 절차 및 방법)
          </h2>
          <p className="mb-2">
            ① 보유기간의 경과, 처리목적 달성 등으로 개인정보가 불필요하게 되었을
            때에는 지체 없이 해당 개인정보를 파기합니다.
          </p>
          <p>
            ② 전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 방법으로
            영구 삭제합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제7조 (개인정보의 안전성 확보조치)
          </h2>
          <p className="mb-2">
            본 서비스는 「개인정보 보호법」 제29조에 따라 다음과 같이 안전성 확보에
            필요한 조치를 하고 있습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              접근 권한 관리: 교사·학급 멤버 권한을 분리하고 보안 규칙을 통해
              데이터 접근을 통제합니다.
            </li>
            <li>
              보안 통신: 전 구간 보안 통신(HTTPS)을 사용하여 데이터를 암호화하여
              전송합니다.
            </li>
            <li>
              취급 인원 최소화: 개인정보를 처리하는 담당 인원을 최소화하여 접근
              권한을 관리합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제8조 (정보주체의 권리·의무 및 행사방법)
          </h2>
          <p className="mb-2">
            ① 정보주체(학생)는 언제든지 개인정보 열람·정정·삭제·처리정지를 요구할
            수 있으며, 학생은 교사 또는 보호자를 통해서도 권리를 행사할 수
            있습니다.
          </p>
          <p>
            ② 권리 행사는 서비스 내 삭제 기능을 통하여 가능하며, 제11조의 문의처로
            요청하는 경우 지체 없이 조치합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제9조 (개인정보 처리업무의 위탁)
          </h2>
          <p className="mb-2">
            본 서비스는 원활한 서비스 제공 및 데이터 관리를 위하여 다음과 같이
            개인정보 처리업무를 위탁하고 있습니다.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>수탁자</b>: Google (Firebase — Cloud Firestore·Storage·
              Authentication)
            </li>
            <li>
              <b>위탁 업무</b>: 서비스 호스팅, 데이터베이스·파일 저장, 인증 및
              시스템 보안 유지
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제10조 (개인정보의 제3자 제공)
          </h2>
          <p>
            본 서비스는 정보주체의 개인정보를 제1조에서 명시한 범위 내에서만
            처리하며, 원칙적으로 개인정보를 제3자에게 제공하지 않습니다. 다만
            정보주체의 동의가 있거나 법률에 특별한 규정이 있는 등 「개인정보
            보호법」 제17조·제18조에 해당하는 경우에 한하여 제공할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제11조 (개인정보 보호책임자 및 문의)
          </h2>
          <p>
            본 서비스는 개인정보 처리에 관한 업무를 총괄하고, 정보주체의 문의·불만
            처리 및 피해 구제를 위하여 아래 연락처를 운영합니다.
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

        <section>
          <h2 className="mb-2 text-lg font-extrabold">
            제12조 (개인정보 처리방침의 변경)
          </h2>
          <p>
            이 개인정보 처리방침은 {UPDATED}부터 적용됩니다. 법령이나 운영 정책에
            따라 내용이 변경되는 경우 개정일과 함께 서비스 내에 공지합니다.
          </p>
        </section>
      </div>

      <footer className="mt-10 flex gap-4 border-t border-[var(--md-sys-color-outline-variant)] pt-6 text-sm">
        <Link
          href="/terms"
          className="font-semibold text-[var(--md-sys-color-primary)] hover:underline"
        >
          이용약관
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
