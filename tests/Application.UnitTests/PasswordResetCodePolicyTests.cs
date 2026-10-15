using Application.Auth.Shared;
using Domain;

namespace Application.UnitTests;

public sealed class PasswordResetCodePolicyTests
{
    private static readonly DateTime Now = new(2026, 10, 15, 12, 0, 0);

    private static PasswordResetToken Record(string hash = "HASH", int attempts = 0, DateTime? expires = null) =>
        new()
        {
            UserId        = "u1",
            IdentityToken = "t",
            CodeHash      = hash,
            Attempts      = attempts,
            ExpiresAt     = expires ?? Now.AddMinutes(5),
        };

    [Fact]
    public void NewCode_is_six_digits()
    {
        for (int i = 0; i < 200; i++)
            Assert.Matches(@"^\d{6}$", PasswordResetCodePolicy.NewCode());
    }

    [Fact]
    public void Right_code_is_accepted_and_cannot_be_replayed()
    {
        PasswordResetToken r = Record();

        Assert.Equal(CodeCheck.Accepted, PasswordResetCodePolicy.CheckCode(r, "HASH", Now));
        Assert.Null(r.CodeHash);
        Assert.Equal(CodeCheck.Locked, PasswordResetCodePolicy.CheckCode(r, "HASH", Now));
    }

    [Fact]
    public void Wrong_code_counts_an_attempt()
    {
        PasswordResetToken r = Record();

        Assert.Equal(CodeCheck.Wrong, PasswordResetCodePolicy.CheckCode(r, "NOPE", Now));
        Assert.Equal(1, r.Attempts);
        Assert.False(r.IsUsed);
    }

    [Fact]
    public void Code_is_burned_after_max_wrong_attempts_even_if_later_guess_is_right()
    {
        PasswordResetToken r = Record();
        for (int i = 0; i < PasswordResetCodePolicy.MaxAttempts; i++)
            PasswordResetCodePolicy.CheckCode(r, "NOPE", Now);

        Assert.True(r.IsUsed);
        Assert.Equal(CodeCheck.Locked, PasswordResetCodePolicy.CheckCode(r, "HASH", Now));
    }

    [Fact]
    public void Code_is_rejected_after_five_minutes()
    {
        PasswordResetToken r = Record(expires: Now.AddMinutes(PasswordResetCodePolicy.CodeLifetimeMinutes));

        Assert.Equal(CodeCheck.Accepted, PasswordResetCodePolicy.CheckCode(Record(), "HASH", Now.AddMinutes(4)));
        Assert.Equal(CodeCheck.Expired, PasswordResetCodePolicy.CheckCode(r, "HASH", Now.AddMinutes(5)));
    }

    [Theory]
    [InlineData("Foo.Bar@Mail.COM ", "foo.bar@mail.com")]
    [InlineData("USER@EXAMPLE.GE", "user@example.ge")]
    public void Email_is_lower_cased_and_trimmed(string input, string expected) =>
        Assert.Equal(expected, PasswordResetCodePolicy.NormalizeEmail(input));

    [Theory]
    [InlineData("599123456", "599123456")]
    [InlineData("+995 599 12 34 56", "599123456")]
    [InlineData("995599123456", "599123456")]
    public void Phone_is_reduced_to_nine_local_digits(string input, string expected) =>
        Assert.Equal(expected, PasswordResetCodePolicy.NormalizePhone(input));

    [Fact]
    public void Stored_and_typed_phones_match_regardless_of_country_code()
    {
        Assert.True(PasswordResetCodePolicy.PhonesMatch("995599123456", "599 12 34 56"));
        Assert.False(PasswordResetCodePolicy.PhonesMatch("599123456", "599123457"));
    }
}
