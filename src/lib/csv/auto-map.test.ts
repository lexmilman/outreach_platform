import { describe, expect, it } from "vitest";
import { autoMapColumns } from "./auto-map";

describe("autoMapColumns", () => {
  it("maps common LinkedHelper v1 headers", () => {
    const { mappings } = autoMapColumns([
      "First name",
      "Last name",
      "Profile url",
      "Title",
      "Organization 1",
      "Email 1",
      "Summary",
    ]);
    const byHeader = Object.fromEntries(mappings.map((m) => [m.csvHeader, m.canonical]));
    expect(byHeader["First name"]).toBe("first_name");
    expect(byHeader["Last name"]).toBe("last_name");
    expect(byHeader["Profile url"]).toBe("linkedin_url");
    expect(byHeader["Title"]).toBe("current_title");
    // v1 exports put the current company at "Organization 1" (space-separated).
    // The snake_case `organization_1` in LH v2 is a PRIOR org and is denied;
    // the space-separated form above is handled by Fuse against our alias corpus.
    expect(byHeader["Organization 1"]).toBe("current_company_name");
    expect(byHeader["Email 1"]).toBe("email");
    expect(byHeader["Summary"]).toBe("about");
  });

  it("handles LinkedHelper v2 snake_case headers", () => {
    const headers = [
      "first_name",
      "last_name",
      "full_name",
      "profile_url",
      "sn_hash_id",
      "public_id",
      "headline",
      "location_name",
      "avatar",
      "current_company",
      "current_company_position",
      "email",
    ];
    const { mappings } = autoMapColumns(headers);
    const byHeader = Object.fromEntries(mappings.map((m) => [m.csvHeader, m.canonical]));
    expect(byHeader.first_name).toBe("first_name");
    expect(byHeader.last_name).toBe("last_name");
    expect(byHeader.full_name).toBe("full_name");
    expect(byHeader.profile_url).toBe("linkedin_url");
    expect(byHeader.sn_hash_id).toBe("linkedin_hash_id");
    expect(byHeader.public_id).toBe("public_identifier");
    expect(byHeader.headline).toBe("headline");
    expect(byHeader.location_name).toBe("location");
    expect(byHeader.avatar).toBe("photo_url");
    expect(byHeader.current_company).toBe("current_company_name");
    expect(byHeader.current_company_position).toBe("current_title");
    expect(byHeader.email).toBe("email");
  });

  it("leaves junk columns unmapped", () => {
    const { mappings } = autoMapColumns(["xxxzzz", "Random Column 42"]);
    expect(mappings.every((m) => m.canonical === null)).toBe(true);
  });

  it("does not map two columns to the same canonical", () => {
    const { mappings } = autoMapColumns(["First name", "firstname"]);
    const mapped = mappings.filter((m) => m.canonical === "first_name");
    expect(mapped.length).toBe(1);
  });

  it("never maps `id` to linkedin_hash_id (denylist)", () => {
    const { mappings } = autoMapColumns(["id", "sn_hash_id"]);
    const byHeader = Object.fromEntries(mappings.map((m) => [m.csvHeader, m.canonical]));
    expect(byHeader.id).toBeNull();
    expect(byHeader.sn_hash_id).toBe("linkedin_hash_id");
  });

  it("denies LinkedHelper bookkeeping columns wholesale", () => {
    const headers = [
      "id_type",
      "lh_id",
      "member_id",
      "mini_profile_actual_at",
      "public_id_actual_at",
      "current_company_actual_at",
      "original_full_name",
      "custom_first_name",
      "badges_premium",
      "badges_influencer",
      "third_party_email_1",
      "third_party_email_source_1",
      "message_1_from",
      "replied_message_1_text",
      "last_received_message_send_at",
      "education_1",
      "education_degree_1",
      "organization_2",
      "organization_url_3",
      "organization_website_4",
      "organization_title_5",
      "connected_at",
      "invited_date_iso",
      "member_distance",
      "network_info_following",
      "is_last_message_incoming",
      "tags",
      "note",
      "twitters",
    ];
    const { mappings } = autoMapColumns(headers);
    for (const m of mappings) {
      expect(m.canonical, `${m.csvHeader} should be unmapped`).toBeNull();
    }
  });

  it("picks best-score column when two compete (avatar wins over avatar_id)", () => {
    const { mappings } = autoMapColumns(["avatar_id", "avatar"]);
    const byHeader = Object.fromEntries(mappings.map((m) => [m.csvHeader, m.canonical]));
    expect(byHeader.avatar).toBe("photo_url");
    expect(byHeader.avatar_id).toBeNull();
  });

  it("full LinkedHelper v2 export: only maps the fields we actually want", () => {
    // The complete header set from a real LinkedHelper v2 export (abridged of
    // obviously long repeats like education_1..5, organization_2..6).
    const headers = [
      "id",
      "id_type",
      "public_id",
      "public_id_actual_at",
      "member_id",
      "member_id_actual_at",
      "hash_id",
      "sn_member_id",
      "sn_hash_id",
      "r_member_id",
      "t_hash_id",
      "avatar_id",
      "public_id_2",
      "lh_id",
      "profile_url",
      "email",
      "email_type",
      "third_party_email_1",
      "full_name",
      "first_name",
      "last_name",
      "avatar",
      "headline",
      "original_full_name",
      "original_headline",
      "mini_profile_actual_at",
      "custom_first_name",
      "location_name",
      "industry",
      "summary",
      "address",
      "birthday",
      "badges_premium",
      "current_company",
      "original_current_company",
      "current_company_custom",
      "current_company_position",
      "original_current_company_position",
      "current_company_actual_at",
      "organization_1",
      "organization_url_1",
      "organization_title_1",
      "organization_description_1",
      "organization_website_1",
      "position_description_1",
      "organization_2",
      "education_1",
      "language_1",
      "languages",
      "skills",
      "twitters",
      "phone_1",
      "phone_type_1",
      "messenger_1",
      "tags",
      "note",
      "connected_at",
      "mutual_count",
      "followers",
      "member_distance",
      "connections_count",
      "add_to_target_date",
    ];
    const { mappings } = autoMapColumns(headers);
    const mappedOnly = mappings
      .filter((m) => m.canonical !== null)
      .reduce<Record<string, string>>((acc, m) => {
        acc[m.csvHeader] = m.canonical!;
        return acc;
      }, {});

    // Things we WANT mapped:
    expect(mappedOnly).toEqual({
      profile_url: "linkedin_url",
      sn_hash_id: "linkedin_hash_id",
      public_id: "public_identifier",
      email: "email",
      full_name: "full_name",
      first_name: "first_name",
      last_name: "last_name",
      avatar: "photo_url",
      headline: "headline",
      location_name: "location",
      industry: "current_company_industry",
      summary: "about",
      current_company: "current_company_name",
      current_company_position: "current_title",
      phone_1: "phone",
      followers: "followers_count",
      connections_count: "connections_count",
    });
  });
});
