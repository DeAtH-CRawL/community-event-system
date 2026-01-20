export const families = [
  // Gada family - Family package, 4 members
  { surname: "Gada", head_name: "Jethalal Gada", package_type: "Family", family_size: 4 },

  // Shah families - one Couple and two Family packages
  { surname: "Shah", head_name: "Rakesh Shah", package_type: "Couple", family_size: 2 },
  { surname: "Shah", head_name: "Nirali Shah", package_type: "Family", family_size: 3 },
  { surname: "Shah", head_name: "Hiren Shah", package_type: "Family", family_size: 5 },

  // Mehta families - one Single and one Family package
  { surname: "Mehta", head_name: "Kavita Mehta", package_type: "Single", family_size: 1 },
  { surname: "Mehta", head_name: "Ankit Mehta", package_type: "Family", family_size: 3 },

  // Other community families with realistic package types
  { surname: "Jhawar", head_name: "Jeeya Jhawar", package_type: "Single", family_size: 1 },
  { surname: "Patel", head_name: "Dhruv Patel", package_type: "Family", family_size: 6 },
  { surname: "Chokshi", head_name: "Kinjal Chokshi", package_type: "Couple", family_size: 2 },
  { surname: "Sanghvi", head_name: "Mitali Sanghvi", package_type: "Family", family_size: 4 },
];

export const mockEvent = {
  name: "Community Dinner 2026",
  coupons_per_member: 1,
  guest_coupon_price: 250,
};
