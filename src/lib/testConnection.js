import { supabase } from "./supabase";

export async function testVoterData() {
  const { data, error, count } = await supabase
    .from("voters")
    .select("*", { count: "exact" })
    .limit(5);

  if (error) {
    console.error("Voter query failed:", error);
    return;
  }

  console.log("Total accessible voters:", count);
  console.log("Sample voter records:", data);
}