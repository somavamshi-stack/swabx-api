start=`date +%s`
#sh generate.sh
npm run prettify
docker-compose -f docker-compose.yml build

docker tag breathalyzer_api:swabx blockchain.azurecr.io/breathalyzer_api:swabx
docker push blockchain.azurecr.io/breathalyzer_api:swabx

end=`date +%s`
runtime=$((end-start))
echo "$runtime"
