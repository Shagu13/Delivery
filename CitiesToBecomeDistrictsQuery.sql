SELECT TOP (1000) [Id]
      ,[DistrictName]
      ,[CityId]
      ,[CreatedAt]
      ,[DateDeleted]
      ,[CompanyServicePrice]
  FROM [DeliveryAppDb].[dbo].[Districts]



  SELECT c.Id, c.CityName
FROM Cities c
LEFT JOIN Districts d ON d.CityId = c.Id
WHERE d.Id IS NULL;

INSERT INTO Districts (Id, DistrictName, CityId, CreatedAt, DateDeleted)
VALUES
    
 
    -- Dedoplistskaro
    (NEWID(), 'Tiniskhidi',     (SELECT Id FROM Cities WHERE CityName = 'Gori'), GETUTCDATE(), NULL);