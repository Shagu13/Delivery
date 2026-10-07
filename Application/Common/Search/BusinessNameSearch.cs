namespace Application.Common.Search;

/// <summary>
/// Shop names are often stored wrapped in quotes or brackets (<c>"Original"</c>). The package searches
/// are prefix (<c>LIKE 'term%'</c>) matches so they can use an index, which means a name that
/// starts with a quote never matches what the admin types. Rather than switch to a non-sargable
/// "contains", each business-name column is also tried with each common opening character in
/// front of the term — still a prefix match per variant, so still index-friendly.
/// </summary>
public static class BusinessNameSearch
{
    /// <summary>Always returns <see cref="VariantCount"/> items, so callers can index it inside an EF predicate.</summary>
    public const int VariantCount = 7;

    public static string[] Variants(string term) =>
    [
        term,
        "\"" + term,
        "'" + term,
        "“" + term, // “
        "„" + term, // „
        "«" + term, // «
        "(" + term,
    ];
}
