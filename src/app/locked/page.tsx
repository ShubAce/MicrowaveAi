import { Mascot } from "@/components/Mascot";

export const metadata = { title: "रसोई सखी" };

export default function Locked() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-130 flex-col items-center justify-center gap-6 px-6 text-center">
      <Mascot mood="oops" size={200} />
      <h1 className="text-[30px] font-extrabold leading-tight">यह ऐप परिवार के लिए है</h1>
      <p className="text-[21px] leading-snug text-baingan-soft">
        इसे खोलने के लिए परिवार से मिला पूरा लिंक एक बार खोलिए। उसके बाद ऐप अपने आप खुलेगा।
      </p>
    </main>
  );
}
