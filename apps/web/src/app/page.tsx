import { redirect } from "next/navigation";

/** App entry — primary screen is calendar (§9.2 / §9.4). */
export default function HomePage() {
  redirect("/calendar");
}
