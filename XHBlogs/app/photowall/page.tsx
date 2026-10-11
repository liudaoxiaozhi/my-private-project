import { Suspense } from "react";
import { siteConfig } from "../../siteConfig";
import PhotoWallClient, { PhotoWallView } from "./PhotoWallClient";

export const metadata = {
  title: "照片墙 | " + siteConfig.title,
};

// PhotoWallClient 用 useSearchParams 读 ?album=，静态预渲染时需要 Suspense 边界；
// 预渲染出来的 HTML 先放相册列表（fallback），浏览器里拿到网址参数后再换成真正的视图
export default function PhotoWallPage() {
  return (
    <Suspense fallback={<PhotoWallView albumId={null} />}>
      <PhotoWallClient />
    </Suspense>
  );
}
