'use strict';

const puppeteer = require('puppeteer');

/**
 * Generates a PDF report card using Puppeteer.
 * @param {Object} data - The data to populate the report card.
 * @returns {Promise<Buffer>} - The generated PDF as a buffer.
 */
async function generateReportCard(data) {
  const { school, student, enrollment, session, results, attendance, finalResult } = data;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; margin: 0; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #2c3e50; padding-bottom: 10px; margin-bottom: 20px; }
        .school-name { font-size: 24px; font-weight: bold; text-transform: uppercase; color: #2c3e50; }
        .school-info { font-size: 14px; margin-top: 5px; }
        .report-title { font-size: 20px; font-weight: bold; margin-top: 20px; text-decoration: underline; }
        
        .student-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
        .info-col { width: 48%; }
        .info-row { margin-bottom: 5px; display: flex; }
        .info-label { font-weight: bold; width: 120px; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
        th { background-color: #f2f2f2; font-weight: bold; color: #2c3e50; }
        
        .summary-section { margin-top: 30px; display: flex; justify-content: space-between; }
        .result-box { border: 2px solid #2c3e50; padding: 15px; width: 60%; }
        .attendance-box { border: 1px solid #ddd; padding: 15px; width: 35%; }
        
        .result-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
        .result-label { font-weight: bold; }
        .final-pass { color: green; font-weight: bold; }
        .final-fail { color: red; font-weight: bold; }
        
        .footer { margin-top: 50px; display: flex; justify-content: space-between; text-align: center; }
        .signature { border-top: 1px solid #333; width: 200px; padding-top: 5px; font-size: 12px; }
      </style>
      <title>Report Card</title>
    </head>
    <body>
      <div class="header">
        <div class="school-name">${school.name}</div>
        <div class="school-info">${school.address || ''} | Phone: ${school.phone || ''}</div>
        <div class="report-title">ANNUAL PROGRESS REPORT</div>
        <div class="school-info">Academic Session: ${session.name}</div>
      </div>

      <div class="student-info">
        <div class="info-col">
          <div class="info-row"><span class="info-label">Student Name:</span> <span>${student.first_name} ${student.last_name}</span></div>
          <div class="info-row"><span class="info-label">Admission No:</span> <span>${student.admission_no}</span></div>
          <div class="info-row"><span class="info-label">Roll Number:</span> <span>${enrollment.roll_number || 'N/A'}</span></div>
        </div>
        <div class="info-col">
          <div class="info-row"><span class="info-label">Class:</span> <span>${enrollment.class_name}</span></div>
          <div class="info-row"><span class="info-label">Section:</span> <span>${enrollment.section_name || 'N/A'}</span></div>
          <div class="info-row"><span class="info-label">Father's Name:</span> <span>${student.father_name || 'N/A'}</span></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Theory</th>
            <th>Practical</th>
            <th>Total Marks</th>
            <th>Obtained</th>
            <th>Grade</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => `
            <tr>
              <td>${r.subject}</td>
              <td>${r.theory_marks_obtained !== null ? r.theory_marks_obtained : '-'} / ${r.theory_total || '-'}</td>
              <td>${r.practical_marks_obtained !== null ? r.practical_marks_obtained : '-'} / ${r.practical_total || '-'}</td>
              <td>${r.total_marks}</td>
              <td>${r.is_absent ? 'ABSENT' : r.marks_obtained}</td>
              <td>${r.grade}</td>
              <td>${r.is_pass ? 'PASS' : 'FAIL'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="summary-section">
        <div class="result-box">
          <div class="result-row"><span class="result-label">Aggregate Marks:</span> <span>${finalResult.marks_obtained} / ${finalResult.total_marks}</span></div>
          <div class="result-row"><span class="result-label">Percentage:</span> <span>${finalResult.percentage}%</span></div>
          <div class="result-row"><span class="result-label">Overall Grade:</span> <span>${finalResult.grade}</span></div>
          <div class="result-row"><span class="result-label">Final Result:</span> <span class="final-${finalResult.result}">${finalResult.result.toUpperCase()}</span></div>
          ${finalResult.grace_marks_info ? `<div class="result-row"><span class="result-label">Remarks:</span> <span>Grace marks awarded.</span></div>` : ''}
        </div>
        <div class="attendance-box">
          <div class="result-row"><span class="result-label">Attendance:</span> <span>${attendance.percentage}%</span></div>
          <div class="result-row"><span class="result-label">Days Present:</span> <span>${attendance.effectivePresent} / ${attendance.workingDays}</span></div>
        </div>
      </div>

      <div class="footer">
        <div class="signature">Class Teacher</div>
        <div class="signature">Principal</div>
        <div class="signature">Parent's Signature</div>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new'
  });
  
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
  });

  await browser.close();
  return pdfBuffer;
}

module.exports = { generateReportCard };
