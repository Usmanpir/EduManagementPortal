import { redirect } from "next/navigation";

/** Communication currently has one area; the breadcrumb parent opens it. */
export default function CommunicationPage() {
  redirect("/communication/announcements");
}
