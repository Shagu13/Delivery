using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Persistence;

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        // Walk up directories to find the API project regardless of where the command is run from
        var directory = Directory.GetCurrentDirectory();

        // Try to find appsettings.json by walking up the tree
        string? apiPath = null;
        var current = new DirectoryInfo(directory);

        while (current != null)
        {
            var candidate = Path.Combine(current.FullName, "API");
            if (Directory.Exists(candidate) &&
                File.Exists(Path.Combine(candidate, "appsettings.json")))
            {
                apiPath = candidate;
                break;
            }
            current = current.Parent;
        }

        apiPath ??= Path.Combine(directory, "..", "API");

        var configuration = new ConfigurationBuilder()
            .SetBasePath(apiPath)
            .AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                $"DefaultConnection not found in appsettings.json at: {apiPath}");

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        optionsBuilder.UseSqlServer(connectionString);

        return new AppDbContext(optionsBuilder.Options);
    }
}