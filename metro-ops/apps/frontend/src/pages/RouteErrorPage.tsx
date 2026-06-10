import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export function RouteErrorPage() {
  const error = useRouteError();
  const message = describeRouteError(error);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-on-surface flex items-center justify-center p-margin-mobile">
      <section className="w-full max-w-xl rounded-2xl border border-outline-variant bg-surface p-lg shadow-sm">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700">
          <span className="material-symbols-outlined">error</span>
        </div>
        <h1 className="mt-md text-[24px] font-semibold">页面加载失败</h1>
        <p className="mt-sm text-on-surface-variant leading-7">
          线上分享页已经打开，但前端路由或接口初始化失败。请检查分享地址是否完整，
          以及线上是否配置了后端 API 地址。
        </p>
        <pre className="mt-md overflow-auto rounded-lg bg-surface-container-low p-sm text-[12px] text-on-surface-variant">
          {message}
        </pre>
        <a
          className="mt-md inline-flex h-touch-target items-center justify-center rounded-lg bg-primary px-md font-semibold text-on-primary"
          href="./"
        >
          返回首页
        </a>
      </section>
    </div>
  );
}

function describeRouteError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`;
  }
  if (error instanceof Error) return error.message;
  return String(error ?? "未知错误");
}
