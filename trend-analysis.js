/* Earth Trend Detective analysis module. AI-assisted; disclose in project credits. */
(function (root) {
  "use strict";

  // Small CSV reader supporting commas and escaped quotes inside quoted fields.
  function parseCSV(text) {
    const table=[]; let row=[], field="", quoted=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted) {
        if(c==='"' && text[i+1]==='"'){field+='"';i++;}
        else if(c==='"') quoted=false; else field+=c;
      } else if(c==='"' && field==='') quoted=true;
      else if(c===','){row.push(field);field="";}
      else if(c==='\n' || c==='\r') {
        if(c==='\r' && text[i+1]==='\n') i++;
        row.push(field); if(row.some(v=>v.trim()!=="")) table.push(row);
        row=[];field="";
      } else field+=c;
    }
    if(quoted) throw new Error("CSV has an unclosed quoted field.");
    if(field!=="" || row.length){row.push(field);if(row.some(v=>v.trim()!==""))table.push(row);}
    if(table.length<2) throw new Error("CSV must include a header and at least one data row.");
    const headers=table[0].map(x=>x.trim().replace(/^\uFEFF/,""));
    if(new Set(headers).size!==headers.length) throw new Error("CSV contains duplicate column names.");
    return table.slice(1).map((cells,index)=>{
      if(cells.length!==headers.length) throw new Error("CSV row "+(index+2)+" has a different number of columns.");
      const obj={};headers.forEach((h,i)=>obj[h]=cells[i].trim());return obj;
    });
  }

  function logGamma(z) {
    const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-0.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
    if(z<0.5) return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z-=1;let x=0.9999999999998099;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
    const t=z+c.length-0.5;return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
  }
  function betaCF(a,b,x) {
    const max=200,eps=3e-14,fpmin=1e-300;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;
    if(Math.abs(d)<fpmin)d=fpmin;d=1/d;let h=d;
    for(let m=1;m<=max;m++){
      let m2=2*m,aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<fpmin)d=fpmin;c=1+aa/c;if(Math.abs(c)<fpmin)c=fpmin;d=1/d;h*=d*c;
      aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<fpmin)d=fpmin;c=1+aa/c;if(Math.abs(c)<fpmin)c=fpmin;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<eps)break;
    }return h;
  }
  function regBeta(x,a,b) {
    if(x<=0)return 0;if(x>=1)return 1;
    const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
    return x<(a+1)/(a+b+2)?bt*betaCF(a,b,x)/a:1-bt*betaCF(b,a,1-x)/b;
  }
  function tTwoSidedP(t,df) { return regBeta(df/(df+t*t),df/2,0.5); }
  function normalTwoSidedP(z) {
    // Abramowitz–Stegun approximation for the two-sided standard normal tail.
    const x=Math.abs(z)/Math.SQRT2,t=1/(1+0.3275911*x);
    const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
    return Math.max(0,Math.min(1,1-erf));
  }
  function median(a){if(!a.length)return NaN;const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
  function solve(a,b){const n=b.length,m=a.map((r,i)=>r.slice().concat(b[i]));for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;if(Math.abs(m[p][c])<1e-12)return null;[m[c],m[p]]=[m[p],m[c]];let v=m[c][c];for(let j=c;j<=n;j++)m[c][j]/=v;for(let r=0;r<n;r++)if(r!==c){let f=m[r][c];for(let j=c;j<=n;j++)m[r][j]-=f*m[c][j];}}return m.map(r=>r[n]);}
  function invert(a){const n=a.length,m=a.map((r,i)=>r.slice().concat(Array.from({length:n},(_,j)=>i===j?1:0)));for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;if(Math.abs(m[p][c])<1e-12)return null;[m[c],m[p]]=[m[p],m[c]];let v=m[c][c];for(let j=0;j<2*n;j++)m[c][j]/=v;for(let r=0;r<n;r++)if(r!==c){let f=m[r][c];for(let j=0;j<2*n;j++)m[r][j]-=f*m[c][j];}}return m.map(r=>r.slice(n));}
  function regression(rows,p){const xx=Array.from({length:p},()=>Array(p).fill(0)),xy=Array(p).fill(0);for(const r of rows)for(let i=0;i<p;i++){xy[i]+=r.x[i]*r.y;for(let j=0;j<p;j++)xx[i][j]+=r.x[i]*r.x[j];}const beta=solve(xx,xy),iv=invert(xx);if(!beta||!iv)return null;const residuals=rows.map(r=>r.y-r.x.reduce((s,v,i)=>s+v*beta[i],0)),df=rows.length-p,sse=residuals.reduce((s,v)=>s+v*v,0);if(df<=0)return null;return{beta,residuals,se:Math.sqrt((sse/df)*iv[1][1]),df};}

  function analyzeLocation(rows, options) {
    options=options||{};const min=options.minimumObservations||24;
    const pts=rows.map((r,i)=>{const match=/^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(r.date||"")),v=Number(r.value);if(!match||!Number.isFinite(v))throw new Error("Invalid date/value at row "+(i+1)+".");const y=+match[1],m=+match[2],d=+(match[3]||1);if(m<1||m>12||d<1||d>31)throw new Error("Invalid calendar date at row "+(i+1)+".");return{date:new Date(Date.UTC(y,m-1,d)),year:y,month:m-1,y:v};}).sort((a,b)=>a.date-b.date);
    if(pts.length<min)throw new Error("Need at least "+min+" observations for this location.");
    for(let i=1;i<pts.length;i++)if(+pts[i].date===+pts[i-1].date)throw new Error("Duplicate date for this location: "+pts[i].date.toISOString().slice(0,10));
    const time=p=>(p.date-pts[0].date)/(365.2425*86400000);pts.forEach(p=>p.t=time(p));
    const months=[...new Set(pts.map(p=>p.month))].sort((a,b)=>a-b),rowsForFit=pts.map(p=>({y:p.y,x:[1,p.t,...months.slice(1).map(m=>m===p.month?1:0)]}));
    const fit=months.length>=2?regression(rowsForFit,rowsForFit[0].x.length):null;
    const groups=new Map();for(const p of pts){if(!groups.has(p.month))groups.set(p.month,[]);groups.get(p.month).push(p);}
    let S=0,variance=0,pairs=0,sen=[];
    for(const group of groups.values()){
      for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const delta=group[j].y-group[i].y;S+=Math.sign(delta);pairs++;sen.push(delta/(group[j].t-group[i].t));}
      const ties=new Map();group.forEach(p=>ties.set(p.y,(ties.get(p.y)||0)+1));const n=group.length;variance+=(n*(n-1)*(2*n+5)-[...ties.values()].reduce((s,t)=>s+t*(t-1)*(2*t+5),0))/18;
    }
    const z=variance>0?(S>0?(S-1)/Math.sqrt(variance):S<0?(S+1)/Math.sqrt(variance):0):NaN,mkP=Number.isFinite(z)?normalTwoSidedP(z):NaN;
    const residuals=fit?fit.residuals:pts.map(p=>p.y),a=residuals.slice(1),b=residuals.slice(0,-1),ma=a.reduce((s,v)=>s+v,0)/a.length,mb=b.reduce((s,v)=>s+v,0)/b.length;let num=0,da=0,db=0;for(let i=0;i<a.length;i++){num+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2;}const rho=da&&db?num/Math.sqrt(da*db):NaN;
    const monthMeans=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([m,g])=>({month:m+1,mean:g.reduce((s,p)=>s+p.y,0)/g.length,count:g.length}));
    const slope=fit?fit.beta[1]:NaN,t=fit&&fit.se>0?slope/fit.se:NaN,regP=Number.isFinite(t)?tTwoSidedP(t,fit.df):NaN,senSlope=median(sen);
    return{location:options.location||null,n:pts.length,startDate:pts[0].date.toISOString().slice(0,10),endDate:pts.at(-1).date.toISOString().slice(0,10),elapsedYears:time(pts.at(-1)),
      regression:{slopePerYear:slope,standardError:fit?fit.se:NaN,tStatistic:t,degreesOfFreedom:fit?fit.df:null,pValue:regP,significantAt05:regP<0.05,method:"OLS with calendar-month indicators; conventional t-test"},
      mannKendall:{statisticS:S,z,pValue:mkP,significantAt05:mkP<0.05,seasonal:true,comparablePairs:pairs,method:"Seasonal Mann–Kendall; same calendar month comparisons and tie adjustment"},
      sensSlope:{slopePerYear:senSlope,comparablePairs:sen.length,seasonal:true},
      autocorrelation:{lag1Residual:rho,warning:Math.abs(rho)>=0.3?"Possible meaningful lag-one autocorrelation; conventional regression p-value may be too optimistic.":"No large lag-one residual correlation detected by this simple check."},
      seasonality:{monthlyMeans:monthMeans,meanRange:Math.max(...monthMeans.map(x=>x.mean))-Math.min(...monthMeans.map(x=>x.mean)),interpretation:"Descriptive comparison of calendar-month averages; not a formal seasonality significance test."},
      direction:slope>0?"increasing":slope<0?"decreasing":"flat",
      evidence:regP<0.05&&mkP<0.05&&Math.sign(slope)===Math.sign(senSlope)?"both methods indicate a statistically detectable trend":regP<0.05||mkP<0.05?"mixed evidence; methods do not both support a trend":"neither method finds strong evidence of a trend",
      caveats:["P-values do not give the probability that a trend is real and do not show its cause or practical importance.","The regression p-value is not corrected for autocorrelation.","Seasonal Mann–Kendall and Sen slope compare observations within the same month."]};
  }
  function analyzeCSV(text, options) {
    options=options||{};const records=parseCSV(text),required=["date","region","value"];
    for(const h of required)if(!Object.prototype.hasOwnProperty.call(records[0],h))throw new Error("Required CSV column is missing: "+h);
    const quality={rowCount:records.length,blankFields:0,invalidValues:[],duplicateRecords:[],locations:[],frequency:"unknown"},seen=new Set(),byRegion=new Map(),dates=[];
    records.forEach((r,i)=>{if(required.some(k=>!r[k])){quality.blankFields++;quality.invalidValues.push({row:i+2,reason:"blank required field"});return;}const key=r.date+"|"+r.region;if(seen.has(key)){quality.duplicateRecords.push({row:i+2,date:r.date,region:r.region});return;}seen.add(key);
      if(!/^\d{4}-\d{2}(?:-\d{2})?$/.test(r.date)){quality.invalidValues.push({row:i+2,reason:"unrecognized date"});return;}const value=Number(r.value);if(!Number.isFinite(value)){quality.invalidValues.push({row:i+2,reason:"value is not numeric"});return;}
      dates.push(r.date);if(!byRegion.has(r.region))byRegion.set(r.region,[]);byRegion.get(r.region).push({date:r.date,value});});
    if(!byRegion.size)throw new Error("No valid data rows found.");
    const sortedDates=[...new Set(dates)].sort();quality.dateRange={start:sortedDates[0],end:sortedDates.at(-1)};quality.locations=[...byRegion.keys()].sort();
    const months=sortedDates.map(d=>d.slice(0,7));quality.frequency=months.length>1&&months.every((m,i)=>i===0||((+m.slice(0,4))*12+(+m.slice(5))-((+months[i-1].slice(0,4))*12+(+months[i-1].slice(5)))===1))?"monthly":"irregular or incomplete";
    const results={}, qualityByLocation={};for(const [region,series] of byRegion){
      results[region]=analyzeLocation(series,{location:region,minimumObservations:options.minimumObservations||24});
      const values=series.map(x=>x.value),uniqueMonths=new Set(series.map(x=>x.date.slice(0,7)));
      qualityByLocation[region]={rowCount:series.length,distinctMonths:uniqueMonths.size,missingMonthsComparedWithDataset:sortedDates.length-uniqueMonths.size,minimum:Math.min(...values),maximum:Math.max(...values),zeroCount:values.filter(v=>v===0).length,negativeCount:values.filter(v=>v<0).length};
    }
    quality.byLocation=qualityByLocation;
    const names=Object.keys(results),comparison=names.length===2?{locations:names,regressionSlopeDifferencePerYear:results[names[0]].regression.slopePerYear-results[names[1]].regression.slopePerYear,senSlopeDifferencePerYear:results[names[0]].sensSlope.slopePerYear-results[names[1]].sensSlope.slopePerYear,interpretation:"Descriptive slope comparison only. No formal test of whether the locations' trends differ is performed."}:null;
    return{columns:Object.keys(records[0]),measurement:options.measurement||"not specified in CSV",units:options.units||"not specified in CSV",quality,locations:results,comparison};
  }
  const api={parseCSV,analyzeLocation,analyzeCSV};root.EarthTrendAnalysis=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
